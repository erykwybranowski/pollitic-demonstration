import {Injectable} from '@angular/core';
import {Country} from '../models/country.model';
import { Inject } from '@angular/core';
import {Party} from '../models/party.model';
import {environment} from '../../environments/environment';
import {HttpClient} from '@angular/common/http';
import {Observable, of, switchMap} from 'rxjs';
import {map} from 'rxjs/operators';
import {Group} from "../models/group.model";
import {LatestPollItem, MonthlySupportResponse, MonthlyTrendResponse, NewestPoll, PagedLatestPolls, Poll, PollOption} from "../models/poll.model";
import { API_BASE_URL } from '../runtime-config';

@Injectable({
  providedIn: 'root'
})
export class PartyService {

  constructor(
    private http: HttpClient,
    @Inject(API_BASE_URL) private readonly apiBaseUrl: string
  ) {}

  private mapPoll(p: Poll): Poll {
    return {
      id: p.id,
      pollster: p.pollster,
      media: p.media ?? [],
      startDate: new Date(p.startDate),
      finishDate: new Date(p.finishDate),
      type: p.type,
      sample: p.sample ?? null,
      results: p.results.map(r => ({
        partyId: r.partyId,
        value: r.value
      })),
      others: p.others,
      area: p.area || undefined,
    };
  }

  // Method to get countries
  getCountries(): Observable<Country[]> {
    if (environment.production) {
      return this.http.get<Country[]>(`${this.apiBaseUrl}/countries`);
    } else {
      return of([
        {id: "1", countryCode: 'at', name: 'Austria'},
        {id: "2", countryCode: 'be', name: 'Belgium'},
        {id: "3", countryCode: 'bg', name: 'Bulgaria'},
        {id: "4", countryCode: 'hr', name: 'Croatia'},
        {id: "5", countryCode: 'cy', name: 'Cyprus'},
        {id: "6", countryCode: 'cz', name: 'Czechia'},
        {id: "7", countryCode: 'dk', name: 'Denmark'},
        {id: "8", countryCode: 'ee', name: 'Estonia'},
        {id: "9", countryCode: 'fi', name: 'Finland'},
        {id: "10", countryCode: 'fr', name: 'France'},
        {id: "11", countryCode: 'gr', name: 'Greece'},
        {id: "12", countryCode: 'es', name: 'Spain'},
        {id: "13", countryCode: 'nl', name: 'Netherlands'},
        {id: "14", countryCode: 'ie', name: 'Ireland'},
        {id: "15", countryCode: 'lt', name: 'Lithuania'},
        {id: "16", countryCode: 'lu', name: 'Luxembourg'},
        {id: "17", countryCode: 'lv', name: 'Latvia'},
        {id: "18", countryCode: 'mt', name: 'Malta'},
        {id: "19", countryCode: 'de', name: 'Germany'},
        {id: "20", countryCode: 'pl', name: 'Poland'},
        {id: "21", countryCode: 'pt', name: 'Portugal'},
        {id: "22", countryCode: 'ro', name: 'Romania'},
        {id: "23", countryCode: 'sk', name: 'Slovakia'},
        {id: "24", countryCode: 'si', name: 'Slovenia'},
        {id: "25", countryCode: 'se', name: 'Sweden'},
        {id: "26", countryCode: 'hu', name: 'Hungary'},
        {id: "27", countryCode: 'it', name: 'Italy'}
      ]);
    }
  }

  // Method to get parties based on the country
  getParties(country: string): Observable<Party[]> {
    if (environment.production) {
      return this.http.get<Party[]>(`${this.apiBaseUrl}/parties/${country}`).pipe(
        map(parties => {
          const normalizedParties = parties.map(p => ({
            ...p,
            role: new Set(p.role ?? []), // Convert role to Set<string>
            groups: new Set(p.groups ?? []), // Convert groups to Set<Group>
            cheS_EU: Array.isArray(p.cheS_EU) && p.cheS_EU.length === 1 ? p.cheS_EU[0] : p.cheS_EU ?? null,
            cheS_Economy: Array.isArray(p.cheS_Economy) && p.cheS_Economy.length === 1 ? p.cheS_Economy[0] : p.cheS_Economy ?? null,
            cheS_Progress: Array.isArray(p.cheS_Progress) && p.cheS_Progress.length === 1 ? p.cheS_Progress[0] : p.cheS_Progress ?? null,
            cheS_Liberal: Array.isArray(p.cheS_Liberal) && p.cheS_Liberal.length === 1 ? p.cheS_Liberal[0] : p.cheS_Liberal ?? null,
          }));

          // The API returns abbreviated sub-party DTOs without CHES values.
          // Replace them with their full counterparts from this country response
          // so consumers can traverse composite parties recursively.
          const partiesById = new Map(normalizedParties.map(party => [party.id, party]));
          normalizedParties.forEach(party => {
            party.subParties = (party.subParties ?? []).map(subParty =>
              partiesById.get(subParty.id) ?? subParty
            );
          });

          return normalizedParties;
        })
      );
    } else
    {
      const ropfFilePath = `${environment.localDataPath}${country}.ropf`;

      return this.readLocalFile(ropfFilePath).pipe(
        switchMap((partyLines: string[]) => {
          let partyId = 1; // Initialize party ID counter
          const existingParties: Party[] = []; // Initialize existing parties list

          // Parse each line, update the existingParties list after each party is parsed
          const parties: Party[] = partyLines.map(line => {
            const party = this.parsePartyLine(line, country, partyId++, existingParties); // Pass existingParties for sub-party lookup
            existingParties.push(party); // Add the newly parsed party to the existingParties list
            return party;
          });

          // Read CHES data from the new CSV file and update parties with CHES info
          return this.readCHESData().pipe(
            map((chesData: any[]) => {
              this.updateCHESDataForParties(parties, chesData);
              return parties; // Return the list of parties as an Observable
            })
          );
        })
      );
    }
  }

  getNewestPollsPerCountry(): Observable<NewestPoll[]> {
    // if (environment.production) {
      return this.http.get<NewestPoll[]>(`${this.apiBaseUrl}/newest-polls-per-country`).pipe(
        map(polls => polls.map(p => ({
          id: p.id,
          pollster: p.pollster,
          media: p.media ?? [],
          startDate: new Date(p.startDate),
          finishDate: new Date(p.finishDate),
          type: p.type,
          sample: p.sample ?? null,
          results: p.results.map(r => ({
            partyId: r.partyId,
            value: r.value
          })),
          others: p.others,
          area: p.area ?? undefined,
          countryCode: p.countryCode
        })))
      );
    // }
  }

  getPollsCount(): Observable<number> {
    return this.http.get<number>(`${this.apiBaseUrl}/polls/count`);
  }

  getGroups(): Observable<Group[]> {
    // if (environment.production) {
    return this.http.get<Group[]>(`${this.apiBaseUrl}/groups`);
    // }
  }

  getAllParties(transferCache = true): Observable<Party[]> {
    // if (environment.production) {
    return this.http.get<Party[]>(`${this.apiBaseUrl}/parties`, { transferCache }).pipe(
      map(parties => parties.map(p => ({
        ...p,
        role: new Set(p.role ?? []), // Convert role to Set<string>
        groups: new Set(p.groups ?? []), // Convert groups to Set<Group>
        cheS_EU: Array.isArray(p.cheS_EU) && p.cheS_EU.length === 1 ? p.cheS_EU[0] : p.cheS_EU ?? null,
        cheS_Economy: Array.isArray(p.cheS_Economy) && p.cheS_Economy.length === 1 ? p.cheS_Economy[0] : p.cheS_Economy ?? null,
        cheS_Progress: Array.isArray(p.cheS_Progress) && p.cheS_Progress.length === 1 ? p.cheS_Progress[0] : p.cheS_Progress ?? null,
        cheS_Liberal: Array.isArray(p.cheS_Liberal) && p.cheS_Liberal.length === 1 ? p.cheS_Liberal[0] : p.cheS_Liberal ?? null,
      })))
    );
    // }
  }

  // Helper to read local .ropf file
  private readLocalFile(filePath: string, polls: boolean = false): Observable<string[]> {
    const fileUrl = `${filePath}`;
    return this.http.get(fileUrl, { responseType: 'text' }).pipe(
      map((fileContent: string) => {
        return polls ? this.extractPollLinesFromRopf(fileContent) : this.extractPartyLinesFromRopf(fileContent);
      })
    );
  }

  // Extract party lines from the file content (ignore the lines with "â€˘PF" and "&")
  private extractPartyLinesFromRopf(content: string): string[] {
    const partyLines = [];
    const lines = content.split('\n');

    let partiesStarted = false;
    for (const line of lines) {
      if (line.trim() === '') {
        if (partiesStarted) {
          break; // End extraction after the second empty line
        } else {
          partiesStarted = true; // Start collecting after the first empty line
        }
      } else if (partiesStarted) {
        partyLines.push(line); // Collect party lines between two empty lines
      }
    }

    return partyLines;
  }

  private extractPollLinesFromRopf(content: string): string[] {
    const pollLines = [];
    const lines = content.split('\n');

    for (const line of lines) {
      if (line.trim() === '') {
        break;
      } else{
        pollLines.push(line); // Collect party lines between two empty lines
      }
    }

    return pollLines;
  }

  // Parse a single line from the .ropf file and create a Party object
  private parsePartyLine(line: string, country: string, id: number, existingParties: Party[]): Party {
    const stringId = line.split(':')[0].trim();
    const acronym = this.extractField(line, 'â€˘R:') || this.extractField(line, 'â€˘A:') || "Error";
    const englishName = this.extractField(line, 'â€˘EN:') || "Error";

    // Look for any "â€˘" marker that is not "â€˘EN" and use it for the localName
    const localNames = this.extractLocalNames(line);

    // Look for the number of MPs using the "â€˘MP" marker
    const mp = this.extractField(line, 'â€˘MP:') ? parseInt(this.extractField(line, 'â€˘MP:')!, 10) : null;

    // Look for sub-parties using the "â€˘SUB" marker
    const subParties = this.extractSubParties(line, existingParties);

    // Check for "â€˘GOV" or "â€˘SUP" marker to fill the role field
    let role = new Set<string>;
    if (line.includes('â€˘GOV')) {
      role.add('RzÄ…d');
    } else if (line.includes('â€˘SUP')) {
      role.add('Wsparcie');
    }

    // Apply role to sub-parties recursively if a role is present
    if (subParties) {
      if (role.size > 0) {
        this.applyRoleToSubParties(subParties, role);
      } else {
        const uniqueRoles = new Set<string>;
        subParties.forEach(subParty => {
          if (subParty.role) {
            subParty.role.forEach(subRole => {
              if (!uniqueRoles.has(subRole)) {
                uniqueRoles.add(subRole);
                role.add(subRole);
              }
            })
          }
        })
      }
    }

    // Look for the group using the "â€˘GROUP" marker
    const group = this.extractField(line, 'â€˘GROUP:');

    let groupObjects = undefined;

    if (group) {
      const groups = group.split('/'); // Split the string by slash if there are multiple groups
      groupObjects = groups.map(g => this.getGroup(g.trim())); // Run getGroup for each group
    }

    // If the party has sub-parties and no group of its own, inherit groups from sub-parties
    let uniqueGroups = new Set<Group>();  // Using Set to avoid duplicates

    if (!groupObjects && subParties) {
      const uniqueGroupIdentifiers = new Set<string>();  // Store unique group acronyms or IDs
      subParties.forEach(subParty => {
        if (subParty.groups) {
          subParty.groups.forEach(group => {
            if (!uniqueGroupIdentifiers.has(group.acronym)) {
              uniqueGroupIdentifiers.add(group.acronym);  // Add the group identifier to the Set
              uniqueGroups.add(group);  // Store the actual Group object
            }
          });
        }
      });
    }

    return {
      id: id.toString(),
      stringId: stringId,
      acronym: acronym,
      englishName: englishName,
      localName: localNames,
      countryCode: country,
      cheS_EU: null,
      cheS_Economy: null,
      cheS_Progress: null,
      cheS_Liberal: null,
      subParties: subParties,
      groups: groupObjects ? new Set<Group>(groupObjects) : uniqueGroups,
      mp: mp,
      role: role
    };
  }

  private applyRoleToSubParties(subParties: Party[], role: Set<string>): void {
    subParties.forEach(subParty => {
      subParty.role = role;  // Apply the role to the sub-party

      // Recursively apply the role to any sub-parties of this sub-party
      if (subParty.subParties) {
        this.applyRoleToSubParties(subParty.subParties, role);
      }
    });
  }

  // Method to extract sub-parties using the stringIds
  private extractSubParties(line: string, existingParties: Party[]): Party[] | null {
    const subPartiesString = this.extractField(line, 'â€˘SUB:');
    if (!subPartiesString) {
      return null;
    }

    const subPartyIds = subPartiesString.split(',').map(id => id.trim());
    const subParties = existingParties.filter(party => subPartyIds.includes(party.stringId));

    return subParties.length > 0 ? subParties : null;
  }

// Method to extract multiple local names
  private extractLocalNames(line: string): string[] | null {
    const regex = /â€˘([A-Z]{2,4}):\s*(.*?)(?=â€˘|$)/g;
    let match;
    const localNames: string[] = [];

    // Loop through all matches and ensure it's not "EN"
    while ((match = regex.exec(line)) !== null) {
      const marker = match[1];
      const value = match[2].trim();

      // Collect all local names that are not 'EN' or other known markers like 'GROUP', 'MP', etc.
      if (marker !== 'EN' && marker !== 'SUB' && marker !== 'GROUP' && marker !== 'MP' && marker !== 'GOV' && marker !== 'SUP') {
        localNames.push(value);
      }
    }

    return localNames.length > 0 ? localNames : null;
  }

// Method to extract a field based on a marker
  private extractField(line: string, marker: string): string | null {
    const regex = new RegExp(`${marker}(.*?)(?=â€˘|$)`);
    const match = line.match(regex);
    return match ? match[1].trim() : null;
  }

  // Method to update CHES data for the Party objects
  private updateCHESDataForParties(parties: Party[], chesData: any[]): void {
    parties.forEach(party => {
      const matchingCHESData = chesData.find(data => {
        if (data.countryCode !== party.countryCode) {
          return false;
        }
        // Split the acronym field from the Excel file by "/"
        const acronyms = data.acronym.split('/').map((acr: string) => acr.trim());

        // Check if either part of the acronym matches the party's properties
        return acronyms.some((acronym: string | null) => {
          return acronym === party.acronym ||
            acronym === party.englishName ||
            acronym === party.stringId;
        });
      });

      // If matching CHES data is found, update the Party object with CHES values
      if (matchingCHESData) {
        party.cheS_EU = matchingCHESData.CHES_EU;
        party.cheS_Economy = matchingCHESData.CHES_Economy;
        party.cheS_Progress = matchingCHESData.CHES_Progress;
        party.cheS_Liberal = matchingCHESData.CHES_Liberal;
      } else if (party.subParties && party.subParties.length > 0) {
        // If no CHES data found, but there are sub-parties, aggregate their CHES data
        let subPartiesData = this.getSubPartiesCHESData(party.subParties);
        party.cheS_EU = subPartiesData[0];
        party.cheS_Economy = subPartiesData[1];
        party.cheS_Progress = subPartiesData[2];
        party.cheS_Liberal = subPartiesData[3];
      }
    });
  }

  public getSubPartiesCHESData(parties: Party[]): (number | number[] | null)[] {
    // Initialize arrays to store ranges of CHES values
    let chesEU: number[] = [];
    let chesEconomy: number[] = [];
    let chesProgress: number[] = [];
    let chesLiberal: number[] = [];

    // Helper function to handle both single values and ranges
    const addValueToRange = (range: number[], value: number | number[]) => {
      if (Array.isArray(value)) {
        range.push(...value); // Add both min and max if it's a range
      } else {
        range.push(value); // Add the single value
      }
    };

    // Iterate over sub-parties to collect their CHES data
    parties.forEach(subParty => {
      if (subParty.cheS_EU !== null && subParty.cheS_EU !== undefined) {
        addValueToRange(chesEU, subParty.cheS_EU);
      }
      if (subParty.cheS_Economy !== null && subParty.cheS_Economy !== undefined) {
        addValueToRange(chesEconomy, subParty.cheS_Economy);
      }
      if (subParty.cheS_Progress !== null && subParty.cheS_Progress !== undefined) {
        addValueToRange(chesProgress, subParty.cheS_Progress);
      }
      if (subParty.cheS_Liberal !== null && subParty.cheS_Liberal !== undefined) {
        addValueToRange(chesLiberal, subParty.cheS_Liberal);
      }
    });

    let parentCHES_EU: number | number[] | null = null;
    let parentCHES_Economy: number | number[] | null = null;
    let parentCHES_Progress: number | number[] | null = null;
    let parentCHES_Liberal: number | number[] | null = null;

    // If there are values in the arrays, set them as ranges for the parent party
    if (chesEU.length > 0) {
      const minEU = Math.min(...chesEU);
      const maxEU = Math.max(...chesEU);
      parentCHES_EU = minEU === maxEU ? minEU : [minEU, maxEU]; // Single value if equal
    }

    if (chesEconomy.length > 0) {
      const minEconomy = Math.min(...chesEconomy);
      const maxEconomy = Math.max(...chesEconomy);
      parentCHES_Economy = minEconomy === maxEconomy ? minEconomy : [minEconomy, maxEconomy];
    }

    if (chesProgress.length > 0) {
      const minProgress = Math.min(...chesProgress);
      const maxProgress = Math.max(...chesProgress);
      parentCHES_Progress = minProgress === maxProgress ? minProgress : [minProgress, maxProgress];
    }

    if (chesLiberal.length > 0) {
      const minLiberal = Math.min(...chesLiberal);
      const maxLiberal = Math.max(...chesLiberal);
      parentCHES_Liberal = minLiberal === maxLiberal ? minLiberal : [minLiberal, maxLiberal];
    }

    return [parentCHES_EU, parentCHES_Economy, parentCHES_Progress, parentCHES_Liberal];
  }

  private readCHESData(): Observable<any[]> {
    const filePath = `${environment.localDataPath}CHES.txt`;
    return this.http.get(filePath, { responseType: 'text' }).pipe(
      map((fileContent: string) => {
        return this.parseCHESData(fileContent);
      })
    );
  }

  private parseCHESData(content: string): any[] {
    const chesData: any[] = [];
    const lines = content.split('\n');

    let isDataSection = true; // Flag to track data section
    for (const line of lines) {
      if (line.trim() === '') {
        isDataSection = false; // End of data section
        continue;
      }

      if (isDataSection) {
        const columns = line.split(';');
        if (columns.length > 1) { // Ensure there are enough columns
          chesData.push({
            countryCode: columns[2],
            acronym: columns[3],
            CHES_EU: columns[7],
            CHES_Economy: columns[11],
            CHES_Progress: columns[14],
            CHES_Liberal: columns[17]
          });
        }
      }
    }

    return chesData;
  }

  getGroup(acronym: string): Group {
    switch (acronym) {
      case "LEFT":
        return {
          id: 0,
          acronym: acronym,
          name: "Progressive Alliance of Socialists and Democrats",
          r: 138,
          g: 21,
          b: 28
        }
      case "S&D":
        return {
          id: 1,
          acronym: acronym,
          name: "Progressive Alliance of Socialists and Democrats",
          r: 219,
          g: 58,
          b: 46,
        }
      case "GREENS":
        return {
          id: 2,
          acronym: acronym,
          name: "Greens/European Free Alliance",
          r: 27,
          g: 209,
          b: 36
        }
      case "RE":
        return {
          id: 3,
          acronym: acronym,
          name: "Renew Europe",
          r: 238,
          g: 230,
          b: 1
        }
      case "EPP":
        return {
          id: 4,
          acronym: acronym,
          name: "European People's Party",
          r: 52,
          g: 143,
          b: 235
        }
      case "ECR":
        return {
          id: 5,
          acronym: acronym,
          name: "European Conservatives and Reformists",
          r: 39,
          g: 44,
          b: 186
        }
      case "PfE":
        return {
          id: 6,
          acronym: acronym,
          name: "Patriots for Europe",
          r: 76,
          g: 48,
          b: 122
        }
      case "ESN":
        return {
          id: 7,
          acronym: acronym,
          name: "Europe of Sovereign Nations",
          r: 9,
          g: 52,
          b: 92
        }
      default:
        return {
          id: 8,
          acronym: "undefined",
          name: "undefined",
          r: 100,
          g: 100,
          b: 100
        }
    }
  }

  getPollsCountByCountry(countryCode: string): Observable<number> {
    return this.http.get<number>(`${this.apiBaseUrl}/polls/${countryCode}/count`);
  }

  getMonthlyTrend(
    countryCode: string,
    options: { fromMonth?: string | null; toMonth?: string | null; area?: string | null; pollsters?: string[] | null; equalPollsterWeight?: boolean } = {}
  ): Observable<MonthlyTrendResponse> {
    const params: Record<string, string> = {};
    if (options.fromMonth) {
      params['fromMonth'] = options.fromMonth;
    }
    if (options.toMonth) {
      params['toMonth'] = options.toMonth;
    }
    if (options.area) {
      params['area'] = options.area;
    }
    if (options.pollsters) {
      params['pollsters'] = options.pollsters.join(',');
    }

    params['equalPollsterWeight'] = String(options.equalPollsterWeight ?? false);
    return this.http.get<MonthlyTrendResponse>(`${this.apiBaseUrl}/polls/${countryCode}/monthly-trend`, { params }).pipe(
      map(response => ({
        availableMonths: response.availableMonths ?? [],
        pollsterGroups: response.pollsterGroups ?? [],
        availablePollsters: response.availablePollsters ?? response.pollsters ?? [],
        pollsters: response.pollsters ?? [],
        points: (response.points ?? []).map(point => ({
          ...point,
          area: point.area || undefined,
          results: point.results ?? []
        }))
      }))
    );
  }

  getMonthlyPolls(
    countryCode: string,
    month: string,
    options: { area?: string | null; pollsters?: string[] | null } = {}
  ): Observable<Poll[]> {
    const params: Record<string, string> = { month };
    if (options.area) {
      params['area'] = options.area;
    }
    if (options.pollsters) {
      params['pollsters'] = options.pollsters.join(',');
    }

    return this.http.get<Poll[]>(`${this.apiBaseUrl}/polls/${countryCode}/monthly-polls`, { params }).pipe(
      map(polls => polls.map(poll => this.mapPoll(poll)))
    );
  }
  getMonthlySupport(
    countryCode: string,
    month: string,
    options: { area?: string | null; pollsters?: string[] | null } = {}
  ): Observable<MonthlySupportResponse> {
    const params: Record<string, string> = { month };
    if (options.area) {
      params['area'] = options.area;
    }
    if (options.pollsters) {
      params['pollsters'] = options.pollsters.join(',');
    }

    return this.http.get<MonthlySupportResponse>(`${this.apiBaseUrl}/polls/${countryCode}/monthly-support`, { params }).pipe(
      map(response => ({
        ...response,
        area: response.area || undefined,
        results: response.results ?? [],
        pollsters: response.pollsters ?? []
      }))
    );
  }

  getLatestPolls(countryCode: string, pageIndex: number, pageSize: number): Observable<PagedLatestPolls> {
    return this.http.get<PagedLatestPolls>(`${this.apiBaseUrl}/polls/${countryCode}/latest`, {
      params: {
        pageIndex,
        pageSize
      }
    }).pipe(
      map(response => ({
        totalCount: response.totalCount,
        pageIndex: response.pageIndex,
        pageSize: response.pageSize,
        items: (response.items ?? []).map((item: LatestPollItem) => ({
          poll: this.mapPoll(item.poll),
          previousPoll: item.previousPoll ? this.mapPoll(item.previousPoll) : null
        }))
      }))
    );
  }

  getPollOptions(countryCode: string, area?: string): Observable<PollOption[]> {
    const options = area ? { params: { area } } : {};
    return this.http.get<PollOption[]>(`${this.apiBaseUrl}/polls/${countryCode}/options`, options).pipe(
      map(polls => polls.map(poll => ({
        id: poll.id,
        pollster: poll.pollster,
        finishDate: new Date(poll.finishDate),
        area: poll.area || undefined
      })))
    );
  }

  getPollById(pollId: string): Observable<Poll> {
    return this.http.get<Poll>(`${this.apiBaseUrl}/polls/by-id/${pollId}`).pipe(
      map(poll => this.mapPoll(poll))
    );
  }
  // Method to get polls based on the country code and list of parties
  getPolls(countryCode: string, parties: Party[]): Observable<Poll[]> {
    return this.http.get<Poll[]>(`${this.apiBaseUrl}/polls/${countryCode}`).pipe(
      map(polls => polls.map(p => ({
        id: p.id,
        pollster: p.pollster,
        media: p.media ?? [],
        startDate: new Date(p.startDate),
        finishDate: new Date(p.finishDate),
        type: p.type,
        sample: p.sample ?? null,
        results: p.results.map(r => ({
          partyId: r.partyId,
          value: r.value
        })),
        others: p.others,
        area: p.area ?? undefined,
      })))
    );
  }


  // Helper to parse polling data lines
  private extractPollsFromLines(lines: string[], parties: Party[]): Poll[] {
    const polls: Poll[] = [];
    let currentPoll: Poll | null = null;

    for (const line of lines) {
      if (line.startsWith('â€˘PF:')) {
        // Create new poll
        if (currentPoll) polls.push(currentPoll);
        currentPoll = this.createPollFromLine(line, parties);
      } else if (line.startsWith('&') && currentPoll) {
        // Create a new poll based on the previous one
        const newPoll = this.createPollFromLine(line, parties, currentPoll);
        polls.push(newPoll);
      }
    }

    // Add the last parsed poll
    if (currentPoll) polls.push(currentPoll);

    return polls;
  }

  // Helper to parse a single line into a Poll object
  private createPollFromLine(line: string, parties: Party[], basePoll?: Poll): Poll {
    const poll: Poll = {
      id: "0",
      pollster: basePoll ? basePoll.pollster : this.extractField(line, 'â€˘PF:')!,
      media: basePoll ? [...basePoll.media] : [],
      startDate: basePoll ? basePoll.startDate : new Date(this.extractField(line, 'â€˘FS:')!),
      finishDate: basePoll ? basePoll.finishDate : new Date(this.extractField(line, 'â€˘FE:')!),
      type: basePoll ? basePoll.type : this.extractField(line, 'â€˘SC:')!,
      sample: basePoll?.sample ?? this.extractNumberField(line, 'â€˘SS:', null),
      results: this.extractResults(line, parties).map(result => { return {partyId: result.party.id, value: result.value}}),
      others: this.extractNumberField(line, 'â€˘O', 0)!
    };

    // Add additional media if found in current line
    this.addMultipleFields(line, 'â€˘C:', poll.media);

    return poll;
  }

  private extractNumberField(line: string, marker: string, defaultValue: number | null): number | null {
    const valueStr = this.extractField(line, marker);
    return valueStr ? parseFloat(valueStr) : defaultValue;
  }

  private addMultipleFields(line: string, marker: string, targetArray: string[]): void {
    const regex = new RegExp(`${marker}(.*?)(?=â€˘|$)`, 'g');
    let match;
    while ((match = regex.exec(line)) !== null) {
      targetArray.push(match[1].trim());
    }
  }

  private extractResults(line: string, parties: Party[]): { party: Party, value: number }[] {
    const results: { party: Party, value: number }[] = [];
    const regex = /\s([\p{L}\w\-+]+):\s(\d+(\.\d+)?)/ug;

    let match;
    let totalSupport = 0;
    const tempResults: { party: Party, value: number }[] = [];

    // First pass: collect results and calculate total support
    while ((match = regex.exec(line)) !== null) {
      const acronym = match[1].trim();
      const value = parseFloat(match[2]);
      totalSupport += value; // Sum up support values

      const party = parties.find(p => p.stringId === acronym);
      if (party) {
        tempResults.push({ party: party, value });
      } else if (acronym.includes("+")) {
        const subAcronyms = acronym.split("+").map(sub => sub.trim());
        const allParties = subAcronyms
          .map(sub => parties.find(p => p.stringId === sub))
          .filter((party): party is Party => !!party); // Exclude null/undefined
        if (allParties.length > 0) {
          let groups: Set<Group> = new Set<Group>();
          let roles: Set<string> = new Set<string>();

          for (let party of allParties) {
            if (party.groups && party.groups.size > 0) {
              party.groups.forEach(g => groups.add(g));
            }
            if (party.role && party.role.size > 0) {
              party.role.forEach(r => roles.add(r));
            }
          }
          let CHESData = this.getSubPartiesCHESData(allParties);

          let newParty: Party = {
            id: "0",
            acronym: allParties.map(p => p.acronym).join("/"),
            stringId: allParties.map(p => p.acronym).join("/"),
            englishName: allParties.map(p => p.acronym).join("/"),
            groups: groups,
            role: roles,
            subParties: null,
            countryCode: "null",
            mp: null,
            localName: null,
            cheS_EU: CHESData[0],
            cheS_Economy: CHESData[1],
            cheS_Progress: CHESData[2],
            cheS_Liberal: CHESData[3]
          }
          tempResults.push({ party: newParty, value });
        }
      }
    }

    // Second pass: normalize values based on total support
    tempResults.forEach(result => {
      const normalizedValue = (result.value / totalSupport) * 100; // Calculate percentage
      results.push({ party: result.party, value: Math.round(normalizedValue * 10) / 10 });
    });

    return results;
  }
}







