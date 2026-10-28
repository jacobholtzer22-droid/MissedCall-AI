# Cowboy Spray Foam (Christian) | Google Ads launch spec | Oct 27 2026

Client: Cowboy Spray Foam LLC, Decatur TX (Wise County), serving Fort Worth and Dallas. Family owned, five years in business. The Business row is the one linked to the engagement "Cowboy Spray Foam" on the board.
Site: https://cowboy-spray-foam.vercel.app (pre-launch, noindex; domain cowboysprayfoam.com not connected yet). The final URLs below are the Vercel address. BEFORE the campaign is enabled, the final URLs must be swapped to the live domain with upsert_rsa; the enable approval must not be pushed until the site is live on its domain.
Jacob's budget decision: not given yet. Build at the $15.00/day placeholder (never more than $456/month). The enable approval states the cost; Jacob can change the budget through a set_campaign_budget approval before pushing it.
Advertiser verification: the board says Google wants documents uploaded for this account and Jacob has them in hand. That is a UI step for Jacob; it does not block the build, but the campaign will not serve until it is done.
Manager (login_customer_id): 9811461709. Find the client account under the MCC by name (Cowboy / Christian / spray foam); do NOT create one. If no account exists under the MCC, stop and say so.

## Campaign
Name: Cowboy | Spray Foam Insulation | DFW + Wise County
Type: Search only. Google Search partners OFF. Display network OFF.
Bidding: MAXIMIZE_CLICKS with cpc ceiling $12.00. (DFW "attic insulation near me" runs $8 to $60 a click; expect 1 to 2 clicks a day at $15.)
Budget: $15.00/day. Status at build: PAUSED (Jacob enables through an approval).
Languages: English (1000).
Locations (geo target constant ids): 9059651, 9059623, 9059466, 1026679, 9059462. Location option: PRESENCE only.
Call asset: the business phone from the Engagement row on the board, linked to the "Calls from ads" conversion action. If the board has no phone, build without the call asset and list it as a UI step for Jacob.

## Conversion actions to create before the campaign (all primary unless noted)
1. "Calls from ads" (type AD_CALL, category PHONE_CALL_LEAD, count one per click, call length 30 seconds).
2. "Website lead form" (type WEBPAGE, category SUBMIT_LEAD_FORM). The site has no Google tag yet, so this records nothing until the template adds the tag; create it now so the tag has a label to fire.
3. "Click to call on site" (type WEBSITE_CALL / click to call, category PHONE_CALL_LEAD) if the API allows creating it; otherwise skip and list it as a UI step.

## Ad groups (4). Phrase and exact keywords listed separately. 15 headlines, 4 descriptions each.

### 1. Spray Foam Insulation
URL: https://cowboy-spray-foam.vercel.app/  | path1: spray-foam
Phrase: spray foam insulation; spray foam insulation contractors; spray foam contractors; spray foam installers; spray foam insulation installers; spray foam insulation company; spray foam insulation companies; spray foam company; residential spray foam insulation; commercial spray foam insulation; spray foam insulation cost; spray foam insulation estimate; spray foam insulation quote; foam insulation contractors; spray insulation
Exact: spray foam insulation near me; spray foam near me; spray foam insulation contractors near me; spray foam insulation companies near me; spray foam contractors near me; spray foam installers near me; spray insulation companies near me; foam insulation contractors near me; spray foam insulation fort worth; spray foam insulation dallas; spray foam insulation decatur tx
Headlines: Spray Foam Insulation DFW | Fort Worth & Dallas Spray Foam | Lifetime Spray Foam Warranty | Free Insulation Inspection | Family Owned, Five Years In | Cowboy Spray Foam | Open & Closed Cell Foam | Residential & Commercial | Based in Decatur, Wise County | No Job Too Big or Too Small | Free, No-Pressure Estimate | Attics, Walls, Metal Buildings | Seal & Insulate in One Pass | Keep Texas Attic Heat Out | Spray Foam Installers Near You
Descriptions:
- Open and closed cell spray foam for homes and commercial buildings. Lifetime warranty.
- Family owned, based in Decatur. Serving Fort Worth, Dallas and all of Wise County.
- Free inspection and estimate. We look at your attic or walls and tell you what you need.
- Foam expands into the gaps batts leave open, sealing and insulating in one pass.

### 2. Attic Insulation
URL: https://cowboy-spray-foam.vercel.app/  | path1: attic | path2: insulation
Phrase: attic insulation; attic insulation contractors; attic insulation companies; attic insulation installers; attic insulation services; spray foam attic insulation; spray foam attic; attic foam insulation; spray attic insulation; replace attic insulation; attic insulation cost; attic insulation installation; new attic insulation; attic insulation removal; removing insulation from attic; attic spray foam
Exact: attic insulation near me; attic insulation contractors near me; attic insulation companies near me; attic insulation installers near me; attic insulation fort worth; attic insulation dallas; spray foam attic insulation near me
Headlines: Attic Insulation DFW | Spray Foam Attic Insulation | Free Attic Inspection | Lifetime Spray Foam Warranty | Cowboy Spray Foam | Fort Worth & Dallas Attics | Family Owned, Five Years In | Old Insulation Removed Too | Keep Texas Attic Heat Out | Open Cell, Closed Cell, Blown | Free, No-Pressure Estimate | Based in Decatur, Wise County | Attic Insulation Near You | Seal & Insulate in One Pass | Residential & Commercial
Descriptions:
- Spray foam, blown-in or batt attic insulation. Old insulation removed first if needed.
- Free attic inspection. We look at what you have and tell you what you need, no charge.
- Family owned, five years in business. Serving Fort Worth, Dallas and Wise County.
- Lifetime warranty on open and closed cell spray foam. Call or send the form for a quote.

### 3. Closed Cell & Metal Buildings
URL: https://cowboy-spray-foam.vercel.app/services/closed-cell-spray-foam  | path1: closed-cell
Phrase: closed cell spray foam; closed cell spray foam insulation; closed cell foam insulation; closed cell insulation; metal building insulation; spray foam insulation for metal buildings; spray foam metal building; spray insulation for metal buildings; pole barn insulation; insulating a pole barn; metal shop insulation; shop insulation; barn insulation; crawl space spray foam insulation; spray foam crawl space; warehouse insulation
Exact: closed cell spray foam near me; closed cell insulation near me; metal building insulation near me; metal building spray foam near me; pole barn insulation near me
Headlines: Closed Cell Spray Foam DFW | Metal Building Insulation | Pole Barns & Shops Insulated | Lifetime Spray Foam Warranty | Cowboy Spray Foam | Free Inspection & Estimate | Moisture Barrier Built In | Family Owned, Five Years In | Fort Worth, Dallas & Wise Co | Crawlspaces & Rim Joists | Residential & Commercial | Free, No-Pressure Estimate | Based in Decatur, Wise County | More Insulation Per Inch | Closed Cell Foam Near You
Descriptions:
- Closed cell spray foam for metal buildings, pole barns, shops, crawlspaces and walls.
- Dense, rigid foam that resists moisture and adds strength. Lifetime warranty included.
- Family owned, based in Decatur. Fort Worth, Dallas and Wise County. Free inspection.
- No job too big or too small, residential or commercial. Send the form for an estimate.

### 4. Blown-In Insulation
URL: https://cowboy-spray-foam.vercel.app/services/blown-in-insulation  | path1: blown-in
Phrase: blown in insulation; blown in attic insulation; blown in insulation cost; blown in insulation contractors; blown in insulation companies; blown in cellulose insulation; blown in fiberglass insulation; cellulose insulation; loose fill insulation; blown insulation; blow in insulation; adding insulation to attic; attic insulation top up
Exact: blown in insulation near me; blown in insulation contractors near me; blown in insulation companies near me; blown in attic insulation near me; cellulose insulation near me; blown in insulation fort worth; blown in insulation dallas
Headlines: Blown-In Insulation DFW | Blown-In Attic Insulation | Top Up Thin Attic Insulation | Free Attic Inspection | Cowboy Spray Foam | Cellulose or Fiberglass | Family Owned, Five Years In | Fort Worth, Dallas & Wise Co | Free, No-Pressure Estimate | Based in Decatur, Wise County | Blown-In Insulation Near You | Fills Around Ducts & Wiring | Old Insulation Removed Too | Budget-Friendly Attic Upgrade | Residential & Commercial
Descriptions:
- Loose-fill cellulose or fiberglass blown in to top up thin or settled attic insulation.
- Free attic inspection. We tell you how much you have and what you need, no charge.
- Family owned, five years in business. Serving Fort Worth, Dallas and Wise County.
- Old insulation removed first if needed. Call or send the form for a free estimate.

## Campaign-level negatives (PHRASE match)
diy; do it yourself; kit; kits; can; cans; great stuff; froth pak; froth-pak; frothpak; dow; loctite; dap; tiger foam; handi foam; foam it green; foamitgreen; touch n foam; touch 'n foam; home depot; lowes; lowe's; amazon; walmart; harbor freight; menards; tractor supply; rig; rigs; rig for sale; for sale; rental; rent; supplier; suppliers; supply; equipment; gun; machine; business; start a; jobs; hiring; salary; careers; training; certification; course; school; how to; what is; vs; versus; calculator; roofing; roof coating; foam roof; spray foam roofing; spray foam roof; boat; rv; trailer; van; camper; truck bed; cooler; packaging; packing; craft; foam board; rigid foam; foamular; injection foam; injection insulation; retrofoam; retro foam; icynene; lapolla; demilec; huntsman; basf; johns manville; owens corning; certainteed; gaco; polynor; kraken; graco; terminix; orkin; pest control; radiant barrier; attic foil; attic fan; attic door; attic ladder; attic stairs; attic hatch; attic access; soundproofing; acoustic; asbestos; vermiculite; zonolite; mold; free; cheap; cheapest; r value; r-value; r38; r49; r60; fire rated; fire block; firestop; waterproof; sealant; mobile home; under mobile home; cost per square foot; price per square foot; reviews; complaints; problems; removal cost; uk; loft; how often; best time; within 5 mi; catcher; catchers; ideas; pictures; handyman; gallon; 55 gallon; gap filler; hole filler; big gap; filler; dupont; beest; beast; amptern; ampterm; full stop; fullstop; how much; how thick; do i need; insulation kit; foam kit; spray foam shop; polyethylene; foam system; prodex; concrete lifting; foam jacking; polyjacking; fire proof; fireproof; sprayer

## After the build
- Record the account id on the platform: the linked Business's googleAdsCustomerId = the found customer id (bind_account does this).
- Set the Cowboy Spray Foam ads deliverable step to "enable" with note "Built paused Oct 27 at $15/day placeholder; advertiser verification and the domain still open; final URLs still on vercel.app; waiting on Jacob's Push".
- Produce ONE OpsApproval (kind ads_change): enable the campaign, expected cost $15/day, about $456/month at most. Jacob pushes it from HQ only after verification is done and the site is live on its domain.
- UI steps for Jacob: upload the advertiser verification documents; connect cowboysprayfoam.com and have the ads specialist swap the four final URLs before pushing the enable; set the real budget (a set_campaign_budget approval) once Christian gives a number; confirm billing on the account; sitelinks optional.
- Honest expectation: T&M spray foam got 26 clicks and 0 tracked conversions, but its tag was inactive, so that is not a real read. Expect 2 to 4 clicks a day at $15. Judge on search terms after week 1.
