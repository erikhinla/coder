package cli_test

import (
	"context"
	"fmt"
	"os"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/google/go-cmp/cmp"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"cdr.dev/slog"
	"cdr.dev/slog/sloggers/slogtest"
	"github.com/coder/coder/v2/cli"
)

var expectedEvents = []cli.ResourceUsageEvent{
	{
		Time:              time.Date(2024, 5, 8, 12, 35, 11, 33732000, time.UTC),
		UserName:          "cian",
		UserID:            uuid.MustParse("17c2bcbc-a768-4e99-a726-6980a9e5524a"),
		TemplateName:      "kubernetes",
		TemplateID:        uuid.MustParse("d9e0f7d1-cc41-4708-ab9e-e4eec271799f"),
		TemplateVersion:   "infallible_swirles1",
		TemplateVersionID: uuid.MustParse("32a67799-18b3-46db-96f3-884f49679066"),
		WorkspaceName:     "harlequin-leech-33",
		WorkspaceID:       uuid.MustParse("a2a16dc3-7a03-49fb-8bfc-f5b9bd5421f9"),
		ResourceID:        "coder/coder-cian-harlequin-leech-33",
		ResourceName:      "main",
		ResourceType:      "kubernetes_deployment",
		ResourceUnit:      "cpu_cores",
		ResourceQuantity:  decimal.New(25, -2),
		DurationSeconds:   decimal.New(57632564, -6),
		Attributes: map[string]string{
			"namespace": "coder",
		},
	},
	{
		Time:              time.Date(2024, 5, 8, 12, 35, 11, 33732000, time.UTC),
		UserName:          "cian",
		UserID:            uuid.MustParse("17c2bcbc-a768-4e99-a726-6980a9e5524a"),
		TemplateName:      "kubernetes",
		TemplateID:        uuid.MustParse("d9e0f7d1-cc41-4708-ab9e-e4eec271799f"),
		TemplateVersion:   "infallible_swirles1",
		TemplateVersionID: uuid.MustParse("32a67799-18b3-46db-96f3-884f49679066"),
		WorkspaceName:     "harlequin-leech-33",
		WorkspaceID:       uuid.MustParse("a2a16dc3-7a03-49fb-8bfc-f5b9bd5421f9"),
		ResourceID:        "coder/coder-cian-harlequin-leech-33",
		ResourceName:      "main",
		ResourceType:      "kubernetes_deployment",
		ResourceUnit:      "memory_bytes",
		ResourceQuantity:  decimal.New(512*1024*1024, 0),
		DurationSeconds:   decimal.New(57632564, -6),
		Attributes: map[string]string{
			"namespace": "coder",
		},
	},
	{
		Time:              time.Date(2024, 5, 8, 12, 35, 11, 33732000, time.UTC),
		UserName:          "cian",
		UserID:            uuid.MustParse("17c2bcbc-a768-4e99-a726-6980a9e5524a"),
		TemplateName:      "kubernetes",
		TemplateID:        uuid.MustParse("d9e0f7d1-cc41-4708-ab9e-e4eec271799f"),
		TemplateVersion:   "infallible_swirles1",
		TemplateVersionID: uuid.MustParse("32a67799-18b3-46db-96f3-884f49679066"),
		WorkspaceName:     "harlequin-leech-33",
		WorkspaceID:       uuid.MustParse("a2a16dc3-7a03-49fb-8bfc-f5b9bd5421f9"),
		ResourceID:        "coder/coder-cian-harlequin-leech-33-home",
		ResourceName:      "home",
		ResourceType:      "kubernetes_persistent_volume_claim",
		ResourceUnit:      "disk_bytes",
		ResourceQuantity:  decimal.New(1*1024*1024*1024, 1),
		DurationSeconds:   decimal.New(57632564, -6),
		Attributes: map[string]string{
			"namespace":     "coder",
			"storage_class": "",
		},
	},
}

func TestExpResources_TrackUsage(t *testing.T) {
	t.Parallel()
	log := slogtest.Make(t, nil).Leveled(slog.LevelDebug)
	f, err := os.Open("testdata/exp_resources_track_usage.csv.golden")
	require.NoError(t, err)
	t.Cleanup(func() {
		assert.NoError(t, f.Close())
	})
	wr := cli.WorkspaceBuildInfoCSVReader{R: f}
	builds, err := wr.Read()
	require.NoError(t, err)
	require.Len(t, builds, 2)

	require.Len(t, expectedEvents, 3)
	expectedEventsExploded := make([]cli.ResourceUsageEvent, 0)
	for _, e := range expectedEvents {
		expectedEventsExploded = append(expectedEventsExploded, cli.Explode(30*time.Second, e)...)
	}
	slices.SortFunc(expectedEventsExploded, func(a, b cli.ResourceUsageEvent) int {
		if cmp := a.Time.Compare(b.Time); cmp != 0 {
			return cmp
		}
		return strings.Compare(a.ResourceType, b.ResourceType)
	})
	require.Len(t, expectedEventsExploded, 6, "Expected 6 exploded events, got %d", len(expectedEventsExploded))

	t.Run("NonExploded", func(t *testing.T) {
		t.Parallel()

		rt := cli.NewResourceUsageTracker(0)
		actualEvents := make([]cli.ResourceUsageEvent, 0)
		for _, b := range builds {
			evts, err := rt.Track(context.Background(), log, b)
			require.NoError(t, err)
			actualEvents = append(actualEvents, evts...)
		}

		if assert.Equal(t, len(expectedEvents), len(actualEvents)) {
			for idx, event := range actualEvents {
				if diff := cmp.Diff(expectedEvents[idx], event); diff != "" {
					t.Errorf("Track() mismatch for event %d/%d (-want +got):\n%s", idx+1, len(actualEvents), diff)
				}
			}
		}

		assert.Empty(t, rt.Remainder(time.Now()), "Expected no remaining events after processing all builds")
	})

	t.Run("Exploded", func(t *testing.T) {
		t.Parallel()

		rt := cli.NewResourceUsageTracker(30 * time.Second)
		actualEvents := make([]cli.ResourceUsageEvent, 0)
		for _, b := range builds {
			evts, err := rt.Track(context.Background(), log, b)
			require.NoError(t, err)
			actualEvents = append(actualEvents, evts...)
		}

		if assert.Equal(t, len(expectedEventsExploded), len(actualEvents)) {
			for idx, event := range actualEvents {
				if diff := cmp.Diff(expectedEventsExploded[idx], event); diff != "" {
					t.Errorf("Track() mismatch for event %d/%d (-want +got):\n%s", idx+1, len(actualEvents), diff)
				}
			}
		}

		assert.Empty(t, rt.Remainder(time.Now()), "Expected no remaining events after processing all builds")
	})
}

func TestConvertSIString(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		Input         any
		Expected      decimal.Decimal
		ExpectedError string
	}{
		{
			Input:    "1",
			Expected: decimal.New(1, 0),
		},
		{
			Input:    "3.14159",
			Expected: decimal.New(314159, -5),
		},
		{
			Input:    "1Ki",
			Expected: decimal.New(1024, 0),
		},
		{
			Input:    "1Mi",
			Expected: decimal.New(1024*1024, 0),
		},
		{
			Input:    "1Gi",
			Expected: decimal.New(1024*1024*1024, 0),
		},
		{
			Input:    "1m",
			Expected: decimal.New(1, -3),
		},
	} {
		t.Run(fmt.Sprintf("Input: %v", tc.Input), func(t *testing.T) {
			t.Parallel()
			actual, err := cli.ConvertSIString(tc.Input)
			if tc.ExpectedError != "" {
				require.Error(t, err)
				require.EqualError(t, err, tc.ExpectedError)
			} else {
				require.NoError(t, err)
				require.Equal(t, tc.Expected, actual)
			}
		})
	}
}
