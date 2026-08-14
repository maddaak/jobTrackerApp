package scrape

import "testing"

func TestExtractCompRange(t *testing.T) {
	cases := []struct {
		name    string
		text    string
		wantMin int
		wantMax int
		wantOk  bool
	}{
		{"dollar-prefixed with k only on the right applies k to both sides", "$100-150k", 100000, 150000, true},
		{"bare digits with k only on the right, no $ at all", "Salary: 100-150k per year", 100000, 150000, true},
		{"full numbers with commas on both sides", "$140,000 - $170,000", 140000, 170000, true},
		{"k suffix on both sides", "$100k-$150k", 100000, 150000, true},
		{"phone number is not a salary", "Call us at 212-555-0182", 0, 0, false},
		{"year range is not a salary", "Founded in 2020-2024", 0, 0, false},
		{"small bare range is not a salary", "1-2 years of experience required", 0, 0, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			min, max, ok := extractCompRange(tc.text)
			if ok != tc.wantOk {
				t.Fatalf("extractCompRange(%q) ok = %v, want %v", tc.text, ok, tc.wantOk)
			}
			if !tc.wantOk {
				return
			}
			if min != tc.wantMin || max != tc.wantMax {
				t.Errorf("extractCompRange(%q) = (%d, %d), want (%d, %d)", tc.text, min, max, tc.wantMin, tc.wantMax)
			}
		})
	}
}

// F65: the Greenhouse path used to park the whole JD in a location-typed field and rely on a later
// pass to normalize it. It classifies in place now, so classifyLocation must accept its own output.
func TestClassifyLocationIsIdempotent(t *testing.T) {
	for _, value := range []string{"REMOTE", "NYC_HYBRID", "NYC_IN_PERSON"} {
		if got := classifyLocation(value); got != value {
			t.Fatalf("classifyLocation(%q) = %q, want %q", value, got, value)
		}
	}
}
