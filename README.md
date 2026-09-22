# LeadPredictor
<img width="1303" height="784" alt="image" src="https://github.com/user-attachments/assets/3801f035-d853-4345-ad17-5f5368a82905" />

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

One row per campaign month, showing the funnel **cumulative to the end of that
month** — the totals accrue linearly across the campaign, so the last row equals
the headline numbers. Month count comes from the start and end dates.

The three bars **nest**: the customers bar sits on the leads bar, which sits on
the prospects bar. They share a baseline and a bottom edge, each inner bar is a
little shorter so a band of the one beneath stays visible, and each sits on a
soft elevation shadow rather than carrying an outline. Data ends are rounded,
baseline ends square. All three start at the same baseline, so each bar's length
is that stage's own count, readable straight off the x-axis.

Values are not printed on the bars. They come from the axis, the hover/focus
tooltip, and the **Show data table** view — so nothing is gated behind hovering.

### Colors and contrast

Colors are a single-hue **ordinal** ramp (blue steps 450 / 300 / 100), because a
funnel is ordered stages rather than unrelated categories. The ramp passes the
ordinal checks against the card surface `#16202f`: monotone lightness, adjacent
OKLCH ΔL ≥ 0.06, single hue.

Against the surface, each bar clears 3:1 on its own:

| Bar | vs surface |
|---|---|
| Prospects `#2a78d6` | 3.71:1 |
| Leads `#6da7ec` | 6.54:1 |
| Customers `#cde2fb` | 12.38:1 |

Where the bars overlap, though, a bar's neighbour is the bar behind it, not the
surface — and fills alone cannot solve that. Three stacked bars each needing 3:1
over the one behind compounds to roughly **27:1** from the surface to the
innermost bar, which is brighter than white on a dark surface.

So the **shadow is the contrast boundary**, and each bar carries two, the way
real elevation does:

- an **ambient** halo — tight, unoffset
- a **key** shadow — softer, offset downward, the part that reads as height

The ambient halo is the load-bearing one. An offset-only shadow falls
*underneath* the bar, where the stacked top edge hides it; measured that way the
top edges came out at 2.0–2.2:1. The unoffset halo darkens the parent right at
the child's edge, and that darkened band is the adjacent color.

Verified by sampling the actual rendered pixels either side of every boundary
(page rendered at 4x, `PIL`):

| Boundary | at the data end | at the stacked top |
|---|---|---|
| Customers / Leads | 5.81:1 | 5.56:1 |
| Leads / Prospects | 4.18:1 | 4.13:1 |
| Prospects / surface | 4.03:1 | 4.04:1 |

(The single pixel sitting exactly on an edge is an antialiased blend of both
sides, as antialiasing always is. The figures above are the adjacent color
*regions*.)

Bars are 30px with a 7px radius on the data end (square at the baseline), and
each inner bar is inset by 17% of the bar height — about 5px of the parent left
exposed.

**The blur has to be scaled to that inset.** Two levers are easy to confuse:
`stdDeviation` sets how soft the shadow *looks*, `flood-opacity` sets how deep
its core *goes*. With a wider inset a wide blur is fine, but at 5px a wide blur
swallows the whole exposed band — the parent stops showing its own color at all
and the bars read as one muddy gradient. Measured as max RGB distance from the
parent's true color across the exposed band:

| ambient blur | worst boundary | band drift from true color |
|---|---|---|
| σ 2.8 (wide) | 3.05:1 | 17–18 |
| σ 2.0 | 3.07:1 | 4–5 |
| σ 1.4 + deeper core | **4.03:1** | **2** |

So the blur stays tight enough for the band to survive, and the depth comes from
opacity instead. That is also why softening is not a free dial: past a point the
shadow stops reading as elevation and starts reading as mud.

All text clears 4.5:1 (large text 3:1); input borders and focus rings clear 3:1.

Two things are deliberately left below 3:1, both because the information is
also present as text, which is the documented exception to 1.4.11:

- **Gridlines** (1.41:1) are a reading aid, not the content; every value is in
  the axis, the tooltip and the table.
- **The slider and meter tracks** have no outline against their card (1.37:1).
  The thumb reads at 11.2:1 against the track and the fill at 3.3:1, so the
  control and its position are both clear, and the exact value is printed
  beside every one of them (`40.00%`, `20%`).

## Languages & currencies

English, Български and Deutsch; USD, EUR and GBP. Numbers, currency and
dates are formatted with `Intl` against the selected language's locale, so
switching to Deutsch gives `10.000 €` and `40,00 %`-style output.

To add a language, add an entry to the `I18N` object in `app.js` and an
`<option>` to the language `<select>`.

## Notes

- Dark theme only, by design.
- Tested down to 390px wide.
- Keyboard: every bar is focusable and shows the same readout as hover.
