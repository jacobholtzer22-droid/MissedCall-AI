# Site brief standards (the chief reads this before writing any client brief)

These are Jacob's rules for turning a client's questionnaire answers into a website brief. They are not facts about the client; they are how Align and Acquire builds sites. The chief applies them when writing a brief and lists what it applied under a "Standards applied" heading at the end of the brief, so Jacob can see what came from the client and what came from this file. The client's answers always win over a rule when they conflict; say so in that section.

For Claude Code: put this in the repo as `docs/ops/site-brief-standards.md`, and have `set_brief` / `get_brief_template` read it the same way the questionnaire is read. The chief must never have to be told these again.

## 1. Services

- Name services the way customers search, not the way the client typed them. Split a broad trade into the standard pages for that trade (table below). Fold a sub-step into its parent ("muddying" is drywall finishing; "weed whacking" is lawn mowing).
- Three to six services. Fewer than three reads thin; more than six dilutes. If the client listed more, group the minor ones under a parent page.
- Mark the money makers (questionnaire q2) first in the list; they get the homepage service cards and the first ad groups.
- Every service page says residential, commercial or both, exactly as the client answered q5.

| Trade | Standard service pages |
|---|---|
| Painting | Interior Painting, Exterior Painting, Cabinet Painting (only if the client does it), Drywall Repair and Finishing (if offered) |
| Drywall | Drywall Installation, Drywall Repair, Drywall Finishing (taping and mudding), Texture (if offered) |
| Landscaping / lawn | Lawn Mowing and Maintenance, Spring and Fall Cleanup, Mulch and Bed Care, Hedge and Shrub Trimming, Hardscape or Stone Work (if offered), Snow Removal (seasonal, if offered) |
| Junk removal / hauling | Junk Removal, Furniture and Appliance Removal, Garage and Basement Cleanouts, Yard Debris Removal, Light Demolition (if offered) |
| Pressure washing | House Washing, Driveway and Concrete Cleaning, Paver Cleaning and Sealing, Roof or Soft Washing (if offered), Pool Deck and Enclosure Cleaning |
| Auto detailing | Interior Detailing, Exterior Detailing, Ceramic Coating, Paint Correction (if offered), Mobile Detailing (if they come to the customer) |
| Spray foam / insulation | Spray Foam Insulation, Attic Insulation, Closed Cell and Metal Buildings, Blown-In Insulation, Insulation Removal (if offered) |
| Handyman | Repairs and Odd Jobs, Carpentry and Trim, Drywall and Paint Touch-Ups, Fixture and Appliance Install, Furniture Assembly |
| General contractor / remodel | Kitchen Remodeling, Bathroom Remodeling, Additions, Basement Finishing, Decks and Exterior (per what they do) |
| Windows and doors | Window Replacement, Door Installation, Impact Windows (where relevant), Sliding Glass Doors |
| Blinds and shades | Shutters, Blinds, Shades, Drapery, Motorization (if offered) |
| Water treatment | Water Softeners, Whole-Home Filtration, Reverse Osmosis, Water Testing |
| Hail / dent repair | Paintless Dent Repair, Hail Damage Repair, Insurance Claim Help |
| DJ / events | Weddings, Private Parties, Corporate Events, Kids Parties |

A trade not in the table: pick pages the same way (what people search, three to six, money makers first) and flag it in Standards applied so Jacob can correct it once and the table grows.

## 2. Prices

- Never publish a job range the client gave in q4 ("$1,000 to $6,000"). That number is for ads bidding and Jacob's sanity, not the site. The price message is "Free estimates" unless the client said otherwise in q7.
- Publish a starting price only when the client explicitly asked for one and gave the number.
- Promo (q8) goes in the promo band on the homepage and the service pages, worded exactly as given ("$100 off your first service").

## 3. Numbers and claims

- Years: "over 12 years in business", never a founding year computed from "12 years".
- Licensed and insured, with the license number on the About page and footer when given. Never claim a license, certification, warranty, financing, same-day service, or family/veteran ownership the client did not state in q6 or q7.
- Payment methods (cash, Zelle, Venmo, cards) go on the contact page only, not in headlines.
- Emergency or after-hours: say it only if q13 is yes. If q13 is no, the site must not imply 24/7.

## 4. Hours

- If the client gave hours but no days: show the hours as one line ("8am to 6pm") and no day-by-day table. Never guess days.
- If the client gave days and hours: full table, plus schema.
- The ads schedule comes from the same answer (q12).

## 5. Service area

- The client's counties or radius (q10) become area pages built from the main towns inside them. Towns inside a named county are geography, not client facts, so the chief proposes them in the brief, marked "derived", and Jacob approves or trims. Lead with the town the client wants the most jobs in.
- Six to eight towns per county is plenty. Skip towns the client said he will not drive to.
- The home base address (q9) is never published unless the client said it can be. It goes to the Google listing and to schema areaServed only.

## 6. Copy

- Tagline: do not invent one. With none from the client, use a plain descriptor: "Painting and drywall in Ogden, UT". Jacob or the client replaces it later.
- About page: when q27 is empty, write it from facts only (trade, years, area, what sets them apart). No invented origin story, no invented family members, no invented awards.
- Reviews: only ones the client supplied (q28) or that are visible on a profile URL the client gave. Never write testimonials.
- Differentiators (q7) become the trust strip: free estimates, warranty, discounts, licensed and insured. Only what the client said.
- No em dashes anywhere. Straight quotes. Plain, confident, local. No "we pride ourselves", no "look no further".

## 7. Photos and stock

- Real photos lead, always. When the intake has photos: hero is a finished job with no neighbor's house, meter, readable house number, car or face; service photos map to their service pages; the rest go to the gallery; every stock file is deleted.
- With no photos, the build runs only on Jacob's say ("with stock"). Stock shows the trade's work (interior and exterior painting, drywall finishing, and so on), no faces, no logos, no other company's trucks or uniforms. CLIENT-TODO lists that real photos replace them. A stock site is a preview, never a go-live.
- Logo: use the client's if supplied; otherwise a text wordmark in the display name. Never generate a logo.

## 8. Platform and launch

- `launch.indexable` stays false until the domain is connected and Jacob pushes go-live.
- Display name on the site and the board is the customer-facing name (q1), legal name in the footer and About only. Drop entity suffixes and numbering from the display name ("Yualex Painting 2 LLC" shows as "Yualex Painting").
- Phone is the number from q11, formatted (801) 824-0835 on the site and E.164 on the platform. Email from q14. Those two also become the platform Business's owner phone and owner email, so lead alerts have somewhere to go.
- Contact form defaults: services dropdown on; first and last name together; no address, no ZIP, no email required, no "how soon" question. The client or Jacob can change any of them.
- Domain: if q22 gives one the client owns, the domain deliverable starts at `dns_by_client` or `transfer_requested` per what they said; if none, Jacob buys one and the brief records the wanted name.

## 9. From the same answers, for the ads spec (checkpoint 3)

- q2 money makers → the first ad groups; the remaining services only if budget allows (two ad groups at under $10/day).
- q3 (what they don't want calls for) → campaign negatives, plus the standard negative list for the trade.
- q5 → "commercial" negatives when residential only, and the reverse.
- q10 → geo targets; the priority county gets the bid preference.
- q12 → ad schedule; no schedule outside the hours someone answers.
- q13 no → "emergency", "24 hour", "same day" negatives.
- q18 ÷ 30.4 → daily budget, rounded down to the nearest $0.50; the standing rule "never above q18 per month" is recorded with `record_decision`.
- q19 → conversion goals: calls, form, or both; seasons set the end date or the pause plan.
- q21 competitor names → never bid on them as keywords; use them only for ad copy comparison and negatives.
- Call asset: the q11 number, linked to Calls from ads. Final URLs: the live domain only; vercel.app URLs are swapped before any enable.

## 10. What to put in "Standards applied"

Three to eight lines, like: "Split Painting into Interior and Exterior (rule 1). Did not publish the $1,000 to $6,000 range (rule 2). Towns derived from the four counties, awaiting Jacob (rule 5). No hours table, days unknown (rule 4). Stock preview per Jacob (rule 7)."
