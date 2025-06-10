package coderd

import (
	"context"
	"fmt"
	"io"
	"net/http"

	"github.com/kylecarbs/aisdk-go"
	"golang.org/x/xerrors"

	"cdr.dev/slog"

	"github.com/mitchellh/mapstructure"

	"github.com/coder/coder/v2/coderd/ai"
	"github.com/coder/coder/v2/coderd/httpapi"
	"github.com/coder/coder/v2/codersdk"
)

const systemPrompt = `You are a helpful assistant that can create Coder workspaces. Coder workspaces are ephemeral development environments created for specific coding tasks.

Whenever you name a workspace based on a task prompt, use the following examples as a guide:

# Example 1

Task prompt: make the background purple
Workspace name: purple-bg
Task title: Make the background purple

# Example 2

Task prompt: refactor the UI components to use MUI
Workspace name: refactor-ui-to-mui
Task title: MUI Refactor

# Example 3

Task prompt: hey look through the repository and find all the places where we use postgres. then use that as a guide to refactor the app to use supabase.
Workspace name: migrate-pg-supabase
Task title: Supabase Migration

# Example 4

Task prompt: Look through our BigQuery dataset and generate a report on the top deployments using the prebuilds feature.
Workspace name: bq-prebuilds-report
Task title: BigQuery Prebuilds Report

# Example 5

Task prompt: address this issue: https://github.com/coder/coder/issues/18159
Workspace name: gh-issue-18159
Task title: GitHub Issue coder/coder#18159`

type createWorkspaceToolArgs struct {
	WorkspaceName string `mapstructure:"name"`
	TaskTitle     string `mapstructure:"task_title"`
}

const createWorkspaceToolName = "create_workspace"

var createWorkspaceTool = aisdk.Tool{
	Name:        createWorkspaceToolName,
	Description: "Create a workspace",
	Schema: aisdk.Schema{
		Required: []string{"name", "task_title"},
		Properties: map[string]any{
			"name": map[string]any{
				"type":        "string",
				"description": "Name of the workspace to create.",
			},
			"task_title": map[string]any{
				"type":        "string",
				"description": "Title of the task to create the workspace for. Max 48 characters.",
			},
		},
	},
}

func generateNameAndTitle(ctx context.Context, logger slog.Logger, provider *ai.LanguageModel, modelID string, taskPrompt string) (createWorkspaceToolArgs, error) {
	stream, err := provider.StreamFunc(ctx, ai.StreamOptions{
		Model:        modelID,
		SystemPrompt: systemPrompt,
		Tools:        []aisdk.Tool{createWorkspaceTool},
		Messages: []aisdk.Message{
			{
				Role: "user",
				Parts: []aisdk.Part{
					{
						Type: aisdk.PartTypeText,
						Text: fmt.Sprintf("Use the create_workspace tool to create a workspace based on the following task prompt:\n```\n%s\n```", taskPrompt),
					},
				},
			},
		},
	})
	if err != nil {
		return createWorkspaceToolArgs{}, xerrors.Errorf("failed to generate workspace name: %w", err)
	}
	result := createWorkspaceToolArgs{}
	stream = stream.WithToolCalling(func(toolCall aisdk.ToolCall) aisdk.ToolCallResult {
		if toolCall.Name == createWorkspaceToolName {
			err := mapstructure.Decode(toolCall.Args, &result)
			if err != nil {
				logger.Error(ctx, "failed to decode tool call args", slog.Error(err))
				return nil
			}
		}
		return nil
	})
	if err := stream.Pipe(io.Discard); err != nil {
		return createWorkspaceToolArgs{}, xerrors.Errorf("failed to pipe stream: %w", err)
	}
	if result == (createWorkspaceToolArgs{}) {
		return createWorkspaceToolArgs{}, xerrors.New("no tool call found in the AI response")
	}
	return result, nil
}

// @Summary Generate a task title and workspace name based on a task prompt
// @ID generate-task-title-and-workspace-name-by-task-prompt
// @Security CoderSessionToken
// @Produce json
// @Tags Tasks
// @Param task_prompt query string true "Task prompt"
// @Success 200 {object} codersdk.TaskTitleAndWorkspaceNameResponse
// @Router /ai-tasks/name [get]
func (api *API) TaskTitleAndWorkspaceName(rw http.ResponseWriter, r *http.Request) {
	var (
		ctx        = r.Context()
		taskPrompt = r.URL.Query().Get("task_prompt")
	)
	if taskPrompt == "" {
		httpapi.Write(ctx, rw, http.StatusBadRequest, codersdk.Response{
			Message: "Task prompt is required",
		})
		return
	}

	modelID := "gpt-4.1-nano"
	provider, ok := api.LanguageModels[modelID]
	if !ok {
		httpapi.Write(ctx, rw, http.StatusServiceUnavailable, codersdk.Response{
			Message: fmt.Sprintf("Language model %s not found", modelID),
		})
		return
	}

	// Limit the task prompt to avoid burning tokens. The first 1024 characters
	// are likely enough to generate a good workspace name and task title.
	if len(taskPrompt) > 1024 {
		taskPrompt = taskPrompt[:1024]
	}

	result, err := generateNameAndTitle(ctx, api.Logger, &provider, modelID, taskPrompt)
	if err != nil {
		httpapi.Write(ctx, rw, http.StatusInternalServerError, codersdk.Response{
			Message: "Failed to generate workspace name and task title",
			Detail:  err.Error(),
		})
		return
	}
	truncatedTaskTitle := result.TaskTitle
	if len(truncatedTaskTitle) > 64 {
		truncatedTaskTitle = truncatedTaskTitle[:64]
	}
	httpapi.Write(ctx, rw, http.StatusOK, codersdk.TaskTitleAndWorkspaceNameResponse{
		TaskTitle:     truncatedTaskTitle,
		WorkspaceName: result.WorkspaceName,
	})
}
