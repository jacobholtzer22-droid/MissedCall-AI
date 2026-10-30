// WebsiteLead statuses the 24h follow-up never texts: condemned spam, and leads
// deleted from the client Leads page (DELETE /api/dashboard/website-leads/[id]).
// Its own file so the rule is tested without loading the route.
export const FOLLOW_UP_EXCLUDED_STATUSES = ['spam', 'deleted']
