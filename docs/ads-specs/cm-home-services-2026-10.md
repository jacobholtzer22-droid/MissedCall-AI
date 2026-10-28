# CM Home Services (Cole) | Google Ads launch spec | Oct 27 2026

Client: CM Home Services LLC, central New Jersey (Hamilton, Robbinsville, Bordentown, Princeton, the Windsors and nearby towns). Residential only. The Business row is the one linked to the engagement "CM Home Services LLC" on the board.
Site: https://cm-home-services.vercel.app (pre-launch, noindex; no domain bought yet, planned cmhomeservicesnj.com). The final URLs below are the Vercel address. BEFORE the campaign is enabled, the final URLs must be swapped to the live domain with upsert_rsa; the enable approval must not be pushed until that is done.
Jacob's budget decision: Cole set $300 for his first month (Oct 23 to Nov 22 2026). Daily budget $10.00; with an end date of Nov 22 that is about $260 of real spend from Oct 28 and never more than $304 in November. Do not go above $10.00/day without a new decision from Jacob.
Manager (login_customer_id): 9811461709. Jacob created Cole's Google Ads account on Oct 23 2026 under the MCC. Find it by name (CM Home / Cole); do NOT create one.

## Campaign
Name: CM Home Services | Fall Cleanup + Landscaping | Central NJ
Type: Search only. Google Search partners OFF. Display network OFF.
Bidding: MAXIMIZE_CLICKS with cpc ceiling $6.00. (Jaws leaf removal ran $4.55 CPC, Just Junk It $4.83.)
Budget: $10.00/day. Status at build: PAUSED (Jacob enables through an approval).
End date: 2026-11-22. The create tool cannot set it, so propose set_campaign_end_date 2026-11-22 as a second approval next to the enable.
Languages: English (1000).
Locations (geo target constant ids): 9052088, 9052758, 1022042, 9051623, 1021999, 9051884, 9053131, 1022361, 1022187, 9052158, 1022336, 9052445, 9051724, 1022127, 9052889. Location option: PRESENCE only.
Call asset: the business phone from the Engagement row on the board, linked to the "Calls from ads" conversion action. Do NOT use the Telnyx line +1 813-471-5742 until Cole's conditional forwarding is live (board: missed-call step is waiting on his phone plan change). If the board has no other phone, build without the call asset and list it as a UI step for Jacob.

## Conversion actions to create before the campaign (all primary unless noted)
1. "Calls from ads" (type AD_CALL, category PHONE_CALL_LEAD, count one per click, call length 30 seconds).
2. "Website lead form" (type WEBPAGE, category SUBMIT_LEAD_FORM). The site has no Google tag yet, so this records nothing until the template adds the tag; create it now so the tag has a label to fire.
3. "Click to call on site" (type WEBSITE_CALL / click to call, category PHONE_CALL_LEAD) if the API allows creating it; otherwise skip and list it as a UI step.

## Ad groups (3). Phrase and exact keywords listed separately. 15 headlines, 4 descriptions each.

### 1. Fall Cleanup & Leaf Removal
URL: https://cm-home-services.vercel.app/services/fall-cleanup  | path1: fall-cleanup
Phrase: fall cleanup; fall clean up; fall yard cleanup; fall leaf cleanup; leaf removal; leaf removal service; leaf cleanup; leaf clean up; leaf raking service; lawn clean up; fall lawn cleanup; fall cleanup service
Exact: fall cleanup near me; leaf removal near me; yard clean up near me; leaf cleanup near me; lawn clean up near me; yard cleanup services near me; yard cleanup service; yard cleanup services; fall cleanup hamilton nj; fall cleanup robbinsville nj; leaf removal princeton nj
Headlines: Fall Cleanup in Hamilton, NJ | Leaf Removal & Fall Cleanup | Free, No-Pressure Estimate | 15% Off for Veterans | CM Home Services | Leaves Gone, Beds Cleared | Serving Mercer & Burlington | Book Before Leaves Mat Down | Yard Cleanups for Homeowners | Robbinsville to Princeton | Get a Free Estimate Today | Local Central NJ Crew | Fall Yard Cleanup Near You | Hedges, Beds & Leaf Removal | We Haul It All Away
Descriptions:
- Leaves cleared from lawn and beds, branches picked up, yard winter-ready. Free estimates.
- Serving Hamilton, Robbinsville, Bordentown, Princeton, the Windsors and nearby towns.
- Free estimates and 15% off for veterans. Call or send the form for a real quote.
- Fall cleanups and junk removal from the same crew. Homeowners only, central New Jersey.

### 2. Landscaping & Hedge Trimming
URL: https://cm-home-services.vercel.app/services  | path1: services
Phrase: landscaping services; landscaping company; landscaping companies; local landscapers; residential landscaping; landscaping contractor; hedge trimming; hedge trimming service; bush trimming; shrub trimming; landscape maintenance; yard maintenance; yard work service; landscaper; landscaping; landscaping hamilton nj; landscaping robbinsville nj; landscaping princeton nj
Exact: landscaping near me; landscaper near me; landscapers near me; landscaping services near me; landscaping companies near me; hedge trimming near me; hedge trimming services near me; bush trimming near me; shrub trimming near me; yard maintenance near me
Headlines: Landscaping in Hamilton, NJ | Hedge Trimming & Yard Work | Free, No-Pressure Estimate | 15% Off for Veterans | CM Home Services | Cleanups, Hedges & Stone Work | Serving Mercer & Burlington | Yard Services for Homeowners | Robbinsville to Princeton | Get a Free Estimate Today | Local Central NJ Crew | Landscapers Near You | Hedges Trimmed, Beds Cleaned | Junk & Debris Hauled Too | Call or Send the Form
Descriptions:
- Hedge trimming, yard cleanups, stone work and irrigation for central NJ homeowners.
- Serving Hamilton, Robbinsville, Bordentown, Princeton, the Windsors and nearby towns.
- Free estimates and 15% off for veterans. Tell us what needs doing and get a real price.
- Yard cleanups and junk removal from the same crew. Send the form for a free estimate.

### 3. Junk Removal
URL: https://cm-home-services.vercel.app/services/junk-removal  | path1: junk-removal
Phrase: junk removal; junk removal service; junk removal company; junk hauling; junk pickup; junk pick up; haul away junk; furniture removal; couch removal; mattress removal; appliance removal; hot tub removal; shed removal; garage cleanout; basement cleanout; house cleanout service; estate cleanout; yard debris removal; residential junk removal; local junk removal; mattress disposal; appliance disposal; furniture disposal; refrigerator removal; refrigerator disposal; old furniture removal; junk removal hamilton nj; junk removal robbinsville nj
Exact: junk removal near me; junk removal services near me; junk removal companies near me; junk haulers near me; junk pickup near me; couch removal near me; furniture removal near me; hot tub removal near me; shed removal near me; junk removal princeton nj
Headlines: Junk Removal in Hamilton, NJ | Junk Removal Near You | Free, No-Pressure Estimate | 15% Off for Veterans | CM Home Services | Furniture, Junk & Yard Debris | Serving Mercer & Burlington | Garage & Basement Cleanouts | Robbinsville to Princeton | Get a Free Estimate Today | Local Central NJ Crew | You Point, We Load, It's Gone | Tell Us What You Have | Yard Cleanup & Junk, One Crew | Call or Send the Form
Descriptions:
- Furniture, appliances, mattresses, boxes, yard debris, garage and basement cleanouts.
- Serving Hamilton, Robbinsville, Bordentown, Princeton, the Windsors and nearby towns.
- Free estimates and 15% off for veterans. Describe what you have and we confirm we take it.
- Junk removal and yard cleanups from the same crew. Homeowners only, central New Jersey.

## Campaign-level negatives (PHRASE match)
mowing; lawn mowing; mow; mower; grass cutting; cut grass; lawn care; lawn service; lawn services; lawn maintenance; fertilizer; fertilizing; fertilization; weed control; aeration; overseeding; seeding; sod; turf; artificial turf; artificial grass; mulch; mulching; gutter; gutters; snow; snow removal; plowing; tree removal; tree service; tree trimming; stump; stump grinding; arborist; patio; retaining wall; pavers; paver; pool; lighting; landscape lighting; design; designer; architect; commercial; hoa; jobs; hiring; salary; careers; diy; how to; ideas; pictures; plants; nursery; home depot; lowes; site one; siteone; supply; supplies; rock; stone for sale; free; cheap; cheapest; trugreen; brightview; angi; thumbtack; taskrabbit; craigslist; 1800; 1-800; got junk; junk king; junkluggers; college hunks; drainage; grading; sprinkler repair; irrigation repair; fence; deck; trenton; school; course; license; equipment; rental; truck; dumpster rental; dumpster; roll off; hazardous; paint disposal; tire disposal; electronics recycling; scrap metal prices; donation pickup; goodwill; salvation army; habitat for humanity; landfill; dump hours; transfer station; recycling center; waste management; republic services; bulk pickup; township pickup; curbside; how often; best time; within 5 mi; catcher; catchers; handyman; same day; same-day; garbage; sanitation; trash pickup; trash service; trash removal; junk collection; junk disposal; recycle; recycling; where to; pickup schedule; collection schedule; leaf pickup; leaf collection; blocks; for patio; sprinkling; seniors free; how much does it cost; peonies; leveling

## After the build
- Record the account id on the platform: the linked Business's googleAdsCustomerId = the found customer id (bind_account does this).
- Set the CM Home Services ads deliverable step to "enable" with note "Built paused Oct 27 at $10/day, ends Nov 22; final URLs still on vercel.app; waiting on the domain and Jacob's Push".
- Produce TWO OpsApprovals (kind ads_change): (1) enable the campaign, expected cost $10/day, about $260 through Nov 22; (2) set_campaign_end_date 2026-11-22. Jacob pushes both from HQ.
- UI steps for Jacob: buy and connect cmhomeservicesnj.com, then have the ads specialist swap the three final URLs to the live domain before pushing the enable; confirm billing on the account; advertiser verification if Google asks; sitelinks optional.
- Honest expectation: fall cleanup is what Cole asked for, but Jaws leaf removal converted at 4.7% ($97/lead) while junk removal ran 8.6% ($56/lead) and landscaping better still. All three groups are in; after two weeks pull per-group search terms and cut whichever group has spend and no leads.
