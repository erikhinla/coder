package cors

import (
	"context"

	"github.com/coder/coder/v2/codersdk"
)

type contextKey string

const behaviorKey contextKey = "cors_behavior"

// WithBehavior adds the CORS behavior to the context.
func WithBehavior(ctx context.Context, behavior codersdk.CORSBehavior) context.Context {
	return context.WithValue(ctx, behaviorKey, behavior)
}

// GetBehavior retrieves the CORS behavior from the context.
func GetBehavior(ctx context.Context) codersdk.CORSBehavior {
	if behavior, ok := ctx.Value(behaviorKey).(codersdk.CORSBehavior); ok {
		return behavior
	}
	return codersdk.CORSBehaviorSimple // default
}
