import {Group} from "./group.model";

export interface Party {
  id: string;
  stringId: string;
  acronym: string;
  englishName: string;
  countryCode: string;
  localName: string[] | null;
  cheS_EU: number | number[] | null;
  cheS_Economy: number | number[] | null;
  cheS_Progress: number | number[] | null;
  cheS_Liberal: number | number[] | null;
  subParties: Party[] | null;
  groups: Set<Group> | null;
  mp: number | null;
  role: Set<string> | null;
}
