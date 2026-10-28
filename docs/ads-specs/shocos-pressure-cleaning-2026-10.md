# Shocos Pressure Cleaning | Google Ads launch spec | Oct 27 2026

Client: Shocos Pressure Cleaning (Jacob also calls it Socrates Pressure Cleaning), Treasure Coast FL (Martin, St. Lucie, Indian River and northern Palm Beach counties). Open Monday to Saturday, 6am to 9pm. The Business row is the one linked to the engagement "Shocos Pressure Cleaning" on the board.
Site: https://shocos-pressure-cleaning.vercel.app (pre-launch, noindex, not yet signed off by the client). The final URLs below are the Vercel address. BEFORE the campaign is enabled, the final URLs must be swapped to the live domain with upsert_rsa; the enable approval must not be pushed until the site is signed off and live.
Jacob's budget decision: not given yet. Build at the $10.00/day placeholder (never more than $304/month). The enable approval states the cost; Jacob can change the budget through a set_campaign_budget approval before pushing it.
Manager (login_customer_id): 9811461709. Find the client account under the MCC by name (Shocos / Socrates / pressure); do NOT create one. If no account exists under the MCC, stop and say so.

## Campaign
Name: Shocos | Pressure Cleaning + Paver Sealing | Treasure Coast
Type: Search only. Google Search partners OFF. Display network OFF.
Bidding: MAXIMIZE_CLICKS with cpc ceiling $8.00. ("pressure washing near me" runs $7 to $20 in these counties.)
Budget: $10.00/day. Status at build: PAUSED (Jacob enables through an approval).
Languages: English (1000).
Locations (geo target constant ids): 9057285, 9057302, 9057275, 1015072, 9052625, 1015229, 9053097. Location option: PRESENCE only.
Call asset: the business phone from the Engagement row on the board, linked to the "Calls from ads" conversion action. If the board has no phone, build without the call asset and list it as a UI step for Jacob.

## Conversion actions to create before the campaign (all primary unless noted)
1. "Calls from ads" (type AD_CALL, category PHONE_CALL_LEAD, count one per click, call length 30 seconds).
2. "Website lead form" (type WEBPAGE, category SUBMIT_LEAD_FORM). The site has no Google tag yet, so this records nothing until the template adds the tag; create it now so the tag has a label to fire.
3. "Click to call on site" (type WEBSITE_CALL / click to call, category PHONE_CALL_LEAD) if the API allows creating it; otherwise skip and list it as a UI step.

## Ad groups (4). Phrase and exact keywords listed separately. 15 headlines, 4 descriptions each.

### 1. Pressure Washing (General)
URL: https://shocos-pressure-cleaning.vercel.app/  | path1: pressure | path2: washing
Phrase: pressure washing; pressure cleaning; pressure washing service; pressure washing company; pressure cleaning service; power washing; power washing service; power washing company; exterior cleaning services; residential pressure washing; local pressure washing; mobile pressure washing
Exact: pressure washing near me; pressure cleaning near me; pressure washing services near me; pressure washing companies near me; power washing near me; power washing services near me; power washing companies near me; pressure washing port st lucie; pressure washing stuart fl; pressure washing vero beach
Headlines: Pressure Cleaning Near You | Port St. Lucie Pressure Wash | House, Driveway & Pavers | Shocos Pressure Cleaning | Open 6 Days, 6am to 9pm | Serving Martin & St. Lucie | Free, No-Pressure Quote | Paver Cleaning & Sealing | Pool Decks & Enclosures | Pressure Matched to Surface | Florida Mildew & Algae Gone | Treasure Coast Power Washing | Quality Work, Local Owner | Stuart to Vero Beach | Indian River & Palm Beach
Descriptions:
- House washing, driveways, pavers, pool decks and enclosures. Free quotes, six days a week.
- Serving Martin, St. Lucie, Indian River and northern Palm Beach County. Free quotes.
- Open Monday through Saturday, 6am to 9pm. Call or send the form for a quote on your job.
- Removes the algae, mildew and mold Florida humidity grows on every outdoor surface.

### 2. House Washing
URL: https://shocos-pressure-cleaning.vercel.app/services/house-washing  | path1: house-washing
Phrase: house washing; house pressure washing; house power washing; power wash house; pressure wash house; exterior house cleaning; exterior house washing; home pressure washing; home power washing; house washing service; stucco cleaning; siding cleaning
Exact: house washing near me; house pressure washing near me; house power washing near me; exterior house cleaning near me; pressure wash my house; power wash my house
Headlines: House Washing Near You | Port St. Lucie House Washing | Stucco, Siding & Soffits | Shocos Pressure Cleaning | Open 6 Days, 6am to 9pm | Serving Martin & St. Lucie | Free, No-Pressure Quote | Green & Black Streaks Gone | Pressure Matched to Surface | Treasure Coast House Wash | Quality Work, Local Owner | Stuart to Vero Beach | Indian River & Palm Beach | Add Driveway or Pavers | Florida Mildew & Algae Gone
Descriptions:
- House pressure washing that removes algae, mildew and dirt film from stucco and siding.
- Pressure matched to the surface so paint and stucco stay safe. Serving the Treasure Coast.
- Open Monday through Saturday, 6am to 9pm. Call or send the form for a free quote.
- Add the driveway, pavers or pool deck to the same visit. Martin, St. Lucie, Indian River.

### 3. Paver Cleaning & Sealing
URL: https://shocos-pressure-cleaning.vercel.app/services/paver-cleaning-and-sealing  | path1: paver-sealing
Phrase: paver sealing; paver cleaning; paver cleaning and sealing; paver sealing company; paver sealing service; paver restoration; patio sealing; brick paver sealing; paver maintenance; pressure wash and seal pavers; paver sanding and sealing; driveway paver sealing
Exact: paver sealing near me; paver cleaning and sealing near me; paver sealing companies near me; paver sealer company near me; seal pavers near me; paver restoration near me; paver cleaning near me; patio sealing near me
Headlines: Paver Cleaning & Sealing | Paver Sealing Near You | Port St. Lucie Paver Sealing | Shocos Pressure Cleaning | Bring Back the Paver Color | Serving Martin & St. Lucie | Free, No-Pressure Quote | Driveways, Patios & Pool Decks | Locks Joint Sand in Place | Open 6 Days, 6am to 9pm | Treasure Coast Paver Sealing | Quality Work, Local Owner | Stuart to Vero Beach | Indian River & Palm Beach | Resealing & Maintenance Too
Descriptions:
- Pavers cleaned, re-sanded and sealed to deepen color and slow new growth and stains.
- Driveways, patios, walkways and pool decks. Serving Martin, St. Lucie and Indian River.
- Open Monday through Saturday, 6am to 9pm. Call or send the form for a free quote.
- Wet look or natural look, answered at your quote. Resealing for pavers sealed before.

### 4. Driveway & Pool Deck Cleaning
URL: https://shocos-pressure-cleaning.vercel.app/services/driveway-cleaning  | path1: driveway
Phrase: driveway pressure washing; driveway cleaning; driveway cleaning service; power wash driveway; pressure wash driveway; driveway pressure cleaning; concrete cleaning; concrete pressure washing; pool deck cleaning; pool deck pressure washing; pool enclosure cleaning; pool cage cleaning; patio pressure washing; sidewalk pressure washing
Exact: driveway pressure washing near me; driveway cleaning near me; power wash driveway near me; concrete cleaning near me; pool deck cleaning near me; pool enclosure cleaning near me; pool cage cleaning near me
Headlines: Driveway Pressure Washing | Driveway Cleaning Near You | Pool Deck & Enclosure Clean | Shocos Pressure Cleaning | Tire Marks & Rust Lifted | Serving Martin & St. Lucie | Free, No-Pressure Quote | Concrete & Paver Driveways | Pool Cages Cleaned Gently | Open 6 Days, 6am to 9pm | Port St. Lucie Pressure Wash | Quality Work, Local Owner | Stuart to Vero Beach | Indian River & Palm Beach | Grip Back on Your Pool Deck
Descriptions:
- Lifts tire marks, mildew and sprinkler rust from concrete and paver driveways.
- Pool decks cleaned for grip. Enclosures cleaned at low pressure so screens stay safe.
- Open Monday through Saturday, 6am to 9pm. Call or send the form for a free quote.
- Serving Martin, St. Lucie, Indian River and northern Palm Beach County. Quality work.

## Campaign-level negatives (PHRASE match)
washer; washers; pressure washer; power washer; powerwasher; karcher; ryobi; simpson; honda; dewalt; milwaukee; greenworks; sun joe; sunjoe; worx; generac; craftsman; stanley; kranzle; hotsy; landa; ar blue; titan; electric; gas; psi; gpm; hose; nozzle; surface cleaner; pump; rental; rent; for sale; home depot; lowes; lowe's; harbor freight; amazon; walmart; costco; parts; repair; diy; how to; best; reviews; cheap; cheapest; free; jobs; hiring; salary; careers; business; trailer; soft wash; soft washing; softwash; softwashing; roof; roofs; roofing; window; windows; car; truck; boat; fleet; dumpster; commercial; industrial; parking lot; graffiti; magic bubbles; manatee; pristine; under pressure; mobile home; sealant; best paver sealer; techniseal; duraguard; wet look sealer; gutter; gutters; interior; carpet; rug; chemical; chemicals; bleach; sodium hypochlorite; wand; tips; deck staining; staining; how often; best time; within 5 mi; catcher; catchers; ideas; pictures; handyman; how much does it cost; average cost; cost per square foot; price per square foot; near me prices; prices per hour; best sealer; sealer for sale; sealer home depot; sealer lowes; gallon sealer; 5 gallon; sealer reviews; how to seal; seal pavers yourself

## After the build
- Record the account id on the platform: the linked Business's googleAdsCustomerId = the found customer id (bind_account does this).
- Set the Shocos ads deliverable step to "enable" with note "Built paused Oct 27 at $10/day placeholder; final URLs still on vercel.app; waiting on site sign-off, the domain and Jacob's Push".
- Produce ONE OpsApproval (kind ads_change): enable the campaign, expected cost $10/day, about $304/month at most. Jacob pushes it from HQ only after the site is live on its domain.
- UI steps for Jacob: get the site signed off and on its domain, then have the ads specialist swap the four final URLs before pushing the enable; set the real budget (a set_campaign_budget approval) once the client gives a number; confirm billing on the account; advertiser verification if Google asks; sitelinks optional.
- Honest expectation: no comparable account in the fleet. Expect 1 to 2 clicks a day at $10. Judge on search terms after week 1.
