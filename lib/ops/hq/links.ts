// Ops HQ — links shown in the HQ tab and the job report. Client-safe (no server imports).

/** Google Ads overview for one account (customer id, digits or dashed). */
export const adsAccountUrl = (customerId: string) => `https://ads.google.com/aw/overview?__e=${customerId.replace(/-/g, '')}`
