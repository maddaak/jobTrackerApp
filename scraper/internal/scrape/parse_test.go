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
		// The k applies to both sides, so a side that is already a full number must not be multiplied again.
		{"k shorthand mixed with a full number", "$120k - $150,000", 120000, 150000, true},
		{"full number first, k shorthand second", "$120,000 - $150k", 120000, 150000, true},
		{"a signing bonus is not the salary", "Signing bonus $5-10k. Base $140k-$170k", 140000, 170000, true},
		{"an hourly rate is not an annual salary", "$45 - $60 per hour", 0, 0, false},
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

func TestClassifyLocationReadsHowPostingsPhraseIt(t *testing.T) {
	for text, want := range map[string]string{
		"Remote (US)":                 "REMOTE",
		"This role is not remote":     "",
		"Non-remote, New York office": "",
		"Hybrid, 3 days in office":    "HYBRID",
		"Remote-friendly hybrid":      "HYBRID",
		"On site in Manhattan":        "ON_SITE",
		"In-office five days a week":  "ON_SITE",
		"New York, NY":                "",
	} {
		if got := classifyLocation(text); got != want {
			t.Errorf("classifyLocation(%q) = %q, want %q", text, got, want)
		}
	}
}

func TestTitleFromText(t *testing.T) {
	for text, want := range map[string]string{
		"Senior Backend Engineer\nInitech, New York":                   "Senior Backend Engineer",
		"\n  Staff Data Scientist  \n\nAbout us":                       "Staff Data Scientist",
		"About Initech\nWe build things.\nJob Title: Product Designer": "Product Designer",
		"Position:  Engineering Manager, Platform\nRemote":             "Engineering Manager, Platform",
		"Initech\nWe're hiring!":                                       "",
		"We are looking for an engineer to join our team.":             "",
		"Role: You will lead the design of our APIs.":                  "",
	} {
		if got := titleFromText(text); got != want {
			t.Errorf("titleFromText(%q) = %q, want %q", text, got, want)
		}
	}
}

// The Greenhouse path classifies in place now, so classifyLocation must accept its own output.
func TestClassifyLocationIsIdempotent(t *testing.T) {
	for _, value := range []string{"REMOTE", "HYBRID", "ON_SITE"} {
		if got := classifyLocation(value); got != value {
			t.Fatalf("classifyLocation(%q) = %q, want %q", value, got, value)
		}
	}
}
