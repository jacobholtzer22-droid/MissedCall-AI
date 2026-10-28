# Helper Property Pros (Josue) | Google Ads launch spec | Oct 27 2026

Client: Helper Property Pros, Cottage Grove MN (Twin Cities south metro). Platform businessSlug helper-property-pros; the Business row is the one linked to the engagement "Helper Property Pros" on the board.
Site: https://loveyourhelper.com (live, indexable since Oct 14 2026). Gutter cleaning page exists. There is NO snow removal page yet; the snow ad group lands on the homepage until one is built.
Jacob's budget decision: $250/month MAX. Google charges at most daily x 30.4, so the daily budget is $8.00 ($243.20/month). Do not go above $8.00/day without a new decision from Jacob. No end date.
Manager (login_customer_id): 9811461709. Josue shared his existing Google Ads account with the MCC on Oct 23 2026. Find it under the MCC by name (Helper / Josue / loveyourhelper); do NOT create one.

## Campaign
Name: Helper Pros | Gutters + Snow | SE Twin Cities
Type: Search only. Google Search partners OFF. Display network OFF.
Bidding: MAXIMIZE_CLICKS with cpc ceiling $9.00. (Gutter cleaning clicks run $14 to $31 in these towns; the ceiling keeps the $8 budget from going to one click. JOAB snow ran $6.63 CPC at 17% CVR; snow is where this money works.)
Budget: $8.00/day. Status at build: PAUSED (Jacob enables through an approval).
Languages: English (1000).
Locations (geo target constant ids): 1019784, 9053197, 1019677, 1020099, 9052583, 9052389, 1020091, 1020001. Location option: PRESENCE only.
Call asset: the business phone from the Engagement row on the board, linked to the "Calls from ads" conversion action. If the board has no phone, build without the call asset and list it as a UI step for Jacob.

## Conversion actions to create before the campaign (all primary unless noted)
1. "Calls from ads" (type AD_CALL, category PHONE_CALL_LEAD, count one per click, call length 30 seconds).
2. "Website lead form" (type WEBPAGE, category SUBMIT_LEAD_FORM). The site has no Google tag yet, so this records nothing until the template adds the tag; create it now so the tag has a label to fire.
3. "Click to call on site" (type WEBSITE_CALL / click to call, category PHONE_CALL_LEAD) if the API allows creating it; otherwise skip and list it as a UI step.

## Ad groups (2). Phrase and exact keywords listed separately. 15 headlines, 4 descriptions each.

### 1. Gutter Cleaning
URL: https://loveyourhelper.com/gutter-cleaning  | path1: gutter-cleaning
Phrase: gutter cleaning; gutter cleaning service; gutter cleaning company; gutter cleanout; gutter clean out; clean gutters; rain gutter cleaning; gutter and downspout cleaning; downspout cleaning; gutter cleaning cost; professional gutter cleaning; gutter cleaners
Exact: gutter cleaning near me; gutter cleaning services near me; gutter cleaning companies near me; gutter cleaning woodbury mn; gutter cleaning cottage grove mn; gutter cleaning stillwater mn
Headlines: Gutter Cleaning Cottage Grove | Gutter Cleaning Near You | Hand-Scooped, Fully Flushed | Free Quote, Fast Response | Helper Property Pros | Get It Done Before the Freeze | 5.0 Stars on Google | Water Flows or We Come Back | Serving Woodbury & Stillwater | Bundle a Service, Save 20% | Add Gutter Guards While Here | Local Twin Cities Crew | Free, No-Pressure Quote | One Call, Every Exterior Job | We Respond Within Hours
Descriptions:
- Gutters hand-scooped, fully flushed and inspected before winter. Free quote, fast reply.
- Water flows, or we come back free. Cottage Grove, Woodbury, Stillwater, Oakdale, Afton.
- Add gutter guards so you never clean them again. Bundle a second service and save 20%.
- 5.0 stars on Google from 25 reviews. One local company for gutters, windows and more.

### 2. Snow Removal (no landing page yet; lands on the homepage)
URL: https://loveyourhelper.com/  | path1: snow-removal
Phrase: snow removal; snow removal service; residential snow removal; snow plowing; driveway snow removal; snow shoveling service; snow removal companies; seasonal snow removal; snow clearing service; snow removal contractors; residential snow plowing; snow plowing service; snowplow service; snow plow service; snow plowing cottage grove; snow plowing woodbury; snow removal cottage grove; snow removal woodbury
Exact: snow removal near me; snow removal services near me; snow plowing near me; snow plow service near me; snow removal companies near me; residential snow removal near me; snow removal cottage grove mn; snow removal woodbury mn; snow plowing woodbury mn
Headlines: Residential Snow Removal | Snow Removal Cottage Grove MN | Driveways & Walkways Cleared | Book Before the First Snow | Helper Property Pros | Free Quote, Fast Response | 5.0 Stars on Google | Serving Woodbury & Stillwater | Local Twin Cities Crew | Lock In Your Spot for Winter | Snow Removal Near You | One Call, Every Exterior Job | Bundle a Service, Save 20% | We Respond Within Hours | Oakdale, Afton & Maplewood
Descriptions:
- Residential snow removal for driveways, walkways and steps. Get a free quote today.
- Serving Cottage Grove, Woodbury, Afton, Stillwater, Oakdale and Maplewood. Fast response.
- 5.0 stars on Google from 25 reviews. One local company for snow, gutters and more.
- Request a free quote now and reserve your spot for the season. We respond within hours.

## Campaign-level negatives (PHRASE match)
snow plow for sale; plow for sale; atv plow; atv snow plow; utv plow; utv snow plow; tractor plow; tractor snow plow; skid steer; snow pusher; snow blower; snowblower; snowblowers; jeep plow; jeep snow plow; truck plow; plow truck; hitch plow; hitch snow plow; meyer; western plow; boss plow; fisher plow; snowdogg; snowex; kolpin; moose plow; toro; cub cadet; john deere; kubota; husqvarna; ariens; home depot; lowes; amazon; harbor freight; for sale; rental; rent; jobs; hiring; salary; careers; diy; how to; best way; commercial; parking lot; city of; township; municipal; roof raking; roof rake; ice dam; gutter repair; gutter installation; gutter replacement; gutter install; copper gutters; seamless gutters; new gutters; ned stevens; leaffilter; leaf filter; leafguard; powell; handyman; taskrabbit; thumbtack; angi; craigslist; groupon; free; cheap; cheapest; cost per; price per; equipment; attachment; how often; best time; within 5 mi; catcher; catchers; ideas; pictures; snow bull; snowbull; how much; parking lot plowing; ice dam removal; roof snow

## After the build
- Record the account id on the platform: the linked Business's googleAdsCustomerId = the found customer id (bind_account does this).
- Set the Helper Property Pros ads deliverable step to "enable" with note "Built paused Oct 27 at $8/day; waiting on Jacob's Push".
- Produce ONE OpsApproval (kind ads_change): enable the campaign, expected cost $8/day, about $243/month, under the $250 cap. Jacob pushes it from HQ.
- UI steps for Jacob: confirm billing on the account; either build the /snow-removal page on loveyourhelper.com or pause the Snow Removal ad group in the Ads UI before enabling (there is no tool to pause an ad group); sitelinks optional.
- Honest expectation: $8/day buys roughly 1 gutter click a day in these towns, or 1 to 2 snow clicks. Snow is the better use of the money once the page exists. Judge on search terms after week 1, not on lead count.
