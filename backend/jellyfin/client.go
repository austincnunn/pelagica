package jellyfin

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/url"

	"github.com/gofiber/fiber/v3"
)

type UserMeResponse struct {
	Id     string `json:"Id"`
	Name   string `json:"Name"`
	Policy struct {
		IsAdministrator bool `json:"IsAdministrator"`
	} `json:"Policy"`
}

func AuthenticateByToken(c fiber.Ctx) (bool, error) {
	jellyfinURLRaw := c.Query("jellyfin_url")
	if jellyfinURLRaw == "" {
		return false, errors.New("missing jellyfin_url query parameter")
	}

	baseURL, err := url.Parse(jellyfinURLRaw)
	if err != nil {
		return false, errors.New("invalid jellyfin_url")
	}

	token := c.Get("Authorization")
	if token == "" {
		return false, errors.New("missing Authorization header")
	}

	res, err := get(baseURL, "/Users/Me", token)
	if err != nil {
		return false, err
	}
	defer res.Body.Close()

	if res.StatusCode == http.StatusUnauthorized {
		return false, errors.New("unauthorized: invalid Jellyfin token")
	}

	// Emby has no /Users/Me (it answers 500 "Unrecognized Guid format"),
	// so ask an admin-only endpoint instead
	if res.StatusCode != http.StatusOK {
		return isAdminByAdminEndpoint(baseURL, token)
	}

	var user UserMeResponse
	if err := json.NewDecoder(res.Body).Decode(&user); err != nil {
		return false, err
	}

	return user.Policy.IsAdministrator, nil
}

// isAdminByAdminEndpoint checks admin rights on servers without /Users/Me (Emby)
// by calling an endpoint that only administrators may read.
func isAdminByAdminEndpoint(baseURL *url.URL, token string) (bool, error) {
	res, err := get(baseURL, "/Library/PhysicalPaths", token)
	if err != nil {
		return false, err
	}
	defer res.Body.Close()

	switch res.StatusCode {
	case http.StatusOK:
		return true, nil
	case http.StatusUnauthorized:
		return false, errors.New("unauthorized: invalid Emby token")
	case http.StatusForbidden:
		return false, nil
	default:
		return false, errors.New("failed to authenticate with Emby: " + res.Status)
	}
}

func get(baseURL *url.URL, path string, token string) (*http.Response, error) {
	endpoint, _ := url.Parse(path)
	req, err := http.NewRequest(http.MethodGet, baseURL.ResolveReference(endpoint).String(), nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", token)
	// Emby reads the same value from X-Emby-Authorization
	req.Header.Set("X-Emby-Authorization", token)

	return http.DefaultClient.Do(req)
}
