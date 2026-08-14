// Package textutil holds text helpers shared by the scrape and ai packages.
package textutil

import "unicode/utf8"

func Truncate(s string, limit int) string {
	if len(s) <= limit {
		return s
	}
	// Back off to a rune start so a multi-byte character isn't cut in half.
	for limit > 0 && !utf8.RuneStart(s[limit]) {
		limit--
	}
	return s[:limit]
}
