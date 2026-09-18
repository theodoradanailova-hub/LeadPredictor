# LeadPredictor

A single-page campaign calculator. You give it a revenue goal and two conversion
rates; it tells you how many prospects, leads and customers the campaign needs,
and how that funnel accrues month by month.

No build step, no dependencies. Open `index.html` in a browser, or serve the
folder with anything (`python3 -m http.server`), or publish it to GitHub Pages.

```
index.html   markup
styles.css   dark theme + layout
app.js       model, i18n, SVG chart
```

## The model

It works **backwards from the revenue goal**:

```
customers = totalRevenue / avgOrderValue
leads     = customers / leadResponseRate
prospects = leads     / prospectResponseRate
```

So with $10,000 revenue, a $1,000 average order, a 40% lead response rate and a
20% prospect response rate: 10 customers, 25 leads, 125 prospects. Lower either
rate and the required prospect pool grows.

The percentages on the three tiles are each stage as a share of prospects
(100% / 20% / 8% for the defaults).

## The chart

Horizontal stacked bars, one per campaign month, showing the funnel **cumulative
to the end of that month** — the totals accrue linearly across the campaign, so
the last bar equals the headline numbers. Bar length is the prospect count;
the three segments are mutually exclusive slices of it:

| Segment | Meaning |
|---|---|
| Customers | converted |
| Leads not yet converted | responded, hasn't bought |
| Prospects not yet responding | the remaining pool |

Month count comes from the campaign start and end dates.

Colors are a single-hue **ordinal** ramp (the funnel is ordered stages, not
unrelated categories), validated against the card surface `#16202f` for monotone
lightness, visible step gaps, and contrast. Every value in the chart is also
reachable without hovering, via the bar-tip labels and the **Show data table**
view.

## Languages & currencies

English, Български and Deutsch; USD, EUR, BGN and GBP. Numbers, currency and
dates are formatted with `Intl` against the selected language's locale, so
switching to Deutsch gives `10.000 €` and `40,00 %`-style output.

To add a language, add an entry to the `I18N` object in `app.js` and an
`<option>` to the language `<select>`.

## Notes

- Dark theme only, by design.
- Tested down to 390px wide.
- Keyboard: every bar is focusable and shows the same readout as hover.
