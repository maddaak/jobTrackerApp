package textutil

import (
	"strings"
	"testing"
	"unicode/utf8"
)

func TestTruncateDoesNotSplitAMultiByteRune(t *testing.T) {
	// "é" is 2 bytes (0xC3 0xA9); a byte-offset cut of 1 would land mid-rune.
	s := "café"
	if got := Truncate(s, len(s)-1); strings.Contains(got, "�") || !utf8.ValidString(got) {
		t.Fatalf("Truncate(%q, %d) = %q, want a valid UTF-8 string with no split rune", s, len(s)-1, got)
	}
}
