export interface Poll {
  id: string;
  pollster: string;
  media: string[];
  startDate: Date;
  finishDate: Date;
  type: string;
  sample: number | null;
  results: {partyId: string, value: number}[];
  others: number;
  area?: string;
}
export interface NewestPoll {
  id: string;
  pollster: string;
  media: string[];
  startDate: Date;
  finishDate: Date;
  type: string;
  sample: number | null;
  results: {partyId: string, value: number}[];
  others: number;
  area?: string;
  countryCode: string;
}
export interface PollOption {
  id: string;
  pollster: string;
  finishDate: Date;
  area?: string;
}

export interface PagedLatestPolls {
  totalCount: number;
  pageIndex: number;
  pageSize: number;
  items: LatestPollItem[];
}

export interface LatestPollItem {
  poll: Poll;
  previousPoll: Poll | null;
}

export interface MonthlyTrendResponse {
  pollsterGroups?: { name: string; aliases: string[] }[];
  availableMonths: string[];
  availablePollsters: MonthlyPollsterUsage[];
  pollsters: MonthlyPollsterUsage[];
  points: MonthlyTrendPoint[];
}

export interface MonthlySupportResponse {
  month: string;
  area?: string;
  pollCount: number;
  results: MonthlyPollAggregateResult[];
  pollsters: MonthlyPollsterUsage[];
}

export interface MonthlyTrendPoint {
  month: string;
  area?: string;
  pollCount: number;
  results: MonthlyPollAggregateResult[];
}

export interface MonthlyPollsterUsage {
  name: string;
  count: number;
}

export interface MonthlyPollAggregateResult {
  partyId: string;
  valueSum: number;
  valueCount: number;
  average: number;
}
