//go:build darwin

package sessionstore

import (
	"errors"
	"os"
	"net/url"
	"strings"

	keyring "github.com/zalando/go-keyring"

	"github.com/coder/coder/v2/cli/config"
)

const (
	macServicePrefix = "coder-cli:"
	macAccount       = "session"
)

func serviceName(u *url.URL) string {
	if u == nil || u.Host == "" {
		return macServicePrefix + "default"
	}
	host := strings.TrimSpace(strings.ToLower(u.Host))
	return macServicePrefix + host
}

// Read returns the session token for the given server URL.
// It prefers the macOS Keychain and falls back to file storage if unavailable.
// The returned values are: token, source ("keyring" or "file"), fellBack (true if file was used due to keyring failure), error.
func Read(conf config.Root, serverURL *url.URL) (string, string, bool, error) {
	svc := serviceName(serverURL)
	if tok, err := keyring.Get(svc, macAccount); err == nil && tok != "" {
		return tok, "keyring", false, nil
	}
	// Fallback to file storage.
	tok, ferr := conf.Session().Read()
	if ferr == nil {
		return tok, "file", true, nil
	}
	// If the file doesn't exist, preserve the not-exist error semantics.
	if os.IsNotExist(ferr) {
		return "", "file", true, ferr
	}
	// Some other file read error.
	return "", "file", true, ferr
}

// Write stores the session token for the given server URL.
// It prefers the macOS Keychain and falls back to file storage if the keyring operation fails.
// Returns: source ("keyring" or "file"), fellBack (true if file was used due to keyring failure), error.
func Write(conf config.Root, serverURL *url.URL, token string) (string, bool, error) {
	svc := serviceName(serverURL)
	if err := keyring.Set(svc, macAccount, token); err == nil {
		// Best effort: remove plaintext file if it exists.
		_ = conf.Session().Delete()
		return "keyring", false, nil
	}
	if err := conf.Session().Write(token); err != nil {
		return "file", true, err
	}
	return "file", true, nil
}

// Delete removes any stored session token from both the Keychain and file.
// It ignores not-found conditions on either backend.
func Delete(conf config.Root, serverURL *url.URL) error {
	svc := serviceName(serverURL)
	var errs []error
	if err := keyring.Delete(svc, macAccount); err != nil && !errors.Is(err, keyring.ErrNotFound) {
		errs = append(errs, err)
	}
	if err := conf.Session().Delete(); err != nil && !os.IsNotExist(err) {
		errs = append(errs, err)
	}
	if len(errs) == 0 {
		return nil
	}
	if len(errs) == 1 {
		return errs[0]
	}
	return errors.Join(errs...)
}