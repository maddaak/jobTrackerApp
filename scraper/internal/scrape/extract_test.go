package scrape

import (
	"context"
	"strings"
	"testing"

	"github.com/PuerkitoBio/goquery"
)

func extractFrom(t *testing.T, page string) response {
	t.Helper()
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(page))
	if err != nil {
		t.Fatalf("parse page: %v", err)
	}
	var result response
	extract(context.Background(), doc, &result, "https://jobs.example.com/1")
	return result
}

func jsonLDPage(posting string, head string) string {
	return `<html><head>` + head + `<script type="application/ld+json">` + posting + `</script></head><body></body></html>`
}

// The employer named three ways schema.org allows; the meta tags fill in only when JSON-LD names nothing.
func TestCompanyIsFoundWhicheverWayJSONLDNamesTheEmployer(t *testing.T) {
	siteName := `<meta property="og:site_name" content="Northwind Careers">`
	cases := map[string]struct {
		org  string
		want string
	}{
		"object with a name": {`{"@type":"Organization","name":"Contoso"}`, "Contoso"},
		"plain string":       {`"Contoso"`, "Contoso"},
		"@id reference only": {`{"@id":"#org"}`, "Northwind Careers"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			posting := `{"@type":"JobPosting","title":"Engineer","hiringOrganization":` + tc.org + `}`

			result := extractFrom(t, jsonLDPage(posting, siteName))

			if result.Company != tc.want {
				t.Fatalf("company = %q, want %q", result.Company, tc.want)
			}
			if result.Role != "Engineer" {
				t.Fatalf("role = %q, want the JSON-LD title kept over the meta fallback", result.Role)
			}
		})
	}
}

// The table holds annual pay; 0 means the posting's salary was refused rather than guessed at.
func TestJSONLDSalaryIsReadAsAnnualPay(t *testing.T) {
	for salary, want := range map[string][2]int{
		`{"value":{"minValue":140000,"maxValue":170000}}`:                  {140000, 170000},
		`{"value":{"minValue":"140,000","maxValue":"170,000.50"}}`:         {140000, 170000},
		`{"value":{"minValue":50,"maxValue":60,"unitText":"HOUR"}}`:        {104000, 124800},
		`{"unitText":"MONTH","value":{"minValue":10000,"maxValue":12000}}`: {120000, 144000},
		`{"value":{"value":150000,"unitText":"YEAR"}}`:                     {150000, 150000},
		`{"value":{"minValue":170000,"maxValue":140000}}`:                  {0, 0},
		`{"value":{"minValue":100,"maxValue":200,"unitText":"PIECE"}}`:     {0, 0},
	} {
		posting := `{"@type":"JobPosting","title":"Engineer","hiringOrganization":"Contoso","baseSalary":` + salary + `}`

		result := extractFrom(t, jsonLDPage(posting, ""))

		got := [2]int{}
		if result.CompMin != nil && result.CompMax != nil {
			got = [2]int{*result.CompMin, *result.CompMax}
		}
		if got != want {
			t.Errorf("baseSalary %s: got %v, want %v", salary, got, want)
		}
	}
}

func TestEntityEscapedHTMLInAJSONLDDescriptionLeavesNoTags(t *testing.T) {
	posting := `{"@type":"JobPosting","title":"Engineer","hiringOrganization":"Contoso",` +
		`"description":"&lt;p&gt;Build &lt;strong&gt;services&lt;/strong&gt; &amp;amp; tools&lt;/p&gt;"}`

	result := extractFrom(t, jsonLDPage(posting, ""))

	if strings.ContainsAny(result.Raw, "<>") {
		t.Fatalf("expected no tags in the description, got %q", result.Raw)
	}
	if !strings.Contains(result.Raw, "Build services") {
		t.Fatalf("expected the description's text, got %q", result.Raw)
	}
}
