# Client onboarding questionnaire (the text Jacob sends after payment)

Every new client gets this text right after they pay, together with a request for photos. Clients answer by number, so a pasted list like "1. Yualex Painting 2 LLC / 2. Painting, drywall..." maps to these questions. The chief and anyone writing a brief or an ads spec should read answers against this list.

Priority note in the text: **1 through 14 and 17 through 19 first** (they build the ad campaign). The rest can come after.

## The text, verbatim

Hey {Name}, Rough answers are totally fine, and if you're unsure on anything just say so and we'll knock it out on a quick call.

If you're short on time, I need 1 through 14 and 17 through 19 first. Those are what I need to build the campaign. The rest can come after.

THE BUSINESS
1. Legal business name, and the name you want customers to see if it's different
2. Every service you offer. Then tell me the 2 or 3 you want MORE of (your money makers)
3. Anything you DON'T want calls for? Jobs too small, services you don't do, commercial, rentals, DIY people, etc. This keeps me from paying for junk clicks
4. Rough average job value for your main services
5. Residential, commercial, or both?
6. Years in business, licensed and insured (license # if your trade has one), any certifications or brands you're certified with
7. What sets you apart? Free estimates, financing, warranties, same day service, family or veteran owned, etc. Only stuff that's 100% true since it goes in the ads
8. Any promo or offer you'd be willing to run (ex: $50 off first service, free inspection)

SERVICE AREA
9. Your home base address (for your Google listing, it does NOT have to show publicly)
10. Every city/town you'll actually drive to and the max distance you'll go. Which areas do you want the most jobs in?

PHONE + LEADS
11. What number should customers call?
12. Who answers and what hours can you realistically pick up? Ads sending calls to a phone nobody answers is wasted money, so I'll run the ads around your hours
13. Do you do emergency or after-hours work?
14. Email where you want website quote requests sent

GOOGLE BUSINESS PROFILE
15. Do you have a Google Business Profile (your listing on Google Maps)? If yes, is it verified, and can you add me as a manager? If not, I'll set it up with you. Verification usually needs a short video showing your truck, tools, signage, etc.
16. How many reviews do you have and where? (Google, Facebook, Yelp, Angi, Nextdoor)

GOOGLE ADS ACCOUNT
17. The Gmail you want tied to the account. I'll create it under my manager account and send you an invite
18. Monthly ad budget you're comfortable with. This goes straight to Google, separate from what you pay me. I'll give you my recommendation but I want your number
19. Main goal: phone calls, quote requests, or both? Any busy or slow seasons?
20. Once the account is set up you'll add a card for billing directly inside Google Ads (Google bills you directly, never text me card info). I'll walk you through it, takes 2 min
21. Any competitors you see all over Google that you want to go after?

WEBSITE
22. Do you own a domain already? If not, any preference on the name?
23. Logo (highest quality file you have) and brand colors. No logo is fine, just tell me
24. Photos: real job pics, before/afters, your truck, you and your crew. The more the better. I don't use stock or AI photos, real work converts way better. Google Drive link works great
25. Any websites you like the look of, competitor or not
26. Your social links (Facebook, Instagram, etc.)
27. A few sentences on you and how you got started, for the About page
28. Any customer reviews/testimonials you're good with me using on the site

No rush on all of it at once. Thanks {Name} looking forward to helping you out.

## Where each answer lands

| Q | Intake field | Used by |
|---|---|---|
| 1 | business.legalName, business.displayName | site, ads account name, Business row name |
| 2 | services[] (+ money makers flagged) | site service pages, ads ad groups |
| 3 | ads exclusions | ads campaign negatives |
| 4 | services[].priceNote / avg job value | ads budget and bid decisions |
| 5 | business.customerType | site copy, ads negatives (commercial) |
| 6 | business.yearsInBusiness, licenses | site trust strip, ads headlines |
| 7 | differentiators[] | site and ad copy (only if true) |
| 8 | offer | ads headline, site promo band |
| 9 | business.address (not public unless told) | GBP, schema areaServed |
| 10 | business.serviceArea[], priority area | site area pages, ads geo targets and bid priority |
| 11 | business.phone | site, call asset, platform Business.ownerPhone |
| 12 | hours, who answers | ads ad schedule, site hours |
| 13 | emergency | site copy, ads negatives (emergency) |
| 14 | business.email | Business.ownerEmail (lead notifications) |
| 15 | gbp status | gbp deliverable step |
| 16 | reviews | site testimonials, GBP plan |
| 17 | ads account email | ads deliverable `account` step (Jacob creates under MCC) |
| 18 | ads budget | ads spec daily budget (monthly / 30.4) |
| 19 | goal, seasons | ads conversion goals, campaign timing |
| 20 | billing | ads `payment` step (client does it in Google Ads) |
| 21 | competitors | ads research |
| 22 | domain.current / wanted | domain deliverable |
| 23 | assets logo, style.colors | site |
| 24 | assets photos | site (no stock when real photos exist) |
| 25 | style.referenceSites | site design direction |
| 26 | socials | site footer, schema sameAs |
| 27 | about | About page |
| 28 | reviews.quotes | site testimonials |

## For Claude Code

The chief cannot remember this between chats. Put this file in the repo as `docs/ops/onboarding-questionnaire.md` and give the chief access to it (the `docs/ops/handbook.md` of onboarding checkpoint 4, or a `read_doc` tool over `docs/ops/`), so a pasted numbered list is mapped to intake fields without Jacob pasting the questions each time.
