//go:build !darwin

package sessionstore

import (
	"net/url"

	"github.com/coder/coder/v2/cli/config"
)

// On non-darwin platforms, defer to file storage only. This preserves
// the existing behavior; platform-specific implementations can be added later.
func Read(conf config.Root, _ *url.URL) (string, string, bool, error) {
	tok, err := conf.Session().Read()
	if err != nil {
		return "", "file", false, err
	}
	return tok, "file", false, nil
}

func Write(conf config.Root, _ *url.URL, token string) (string, bool, error) {
	if err := conf.Session().Write(token); err != nil {
		return "file", false, err
	}
	return "file", false, nil
}

func Delete(conf config.Root, _ *url.URL) error {
	return conf.Session().Delete()
}
