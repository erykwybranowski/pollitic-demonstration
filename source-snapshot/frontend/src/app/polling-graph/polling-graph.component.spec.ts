import { NgZone } from '@angular/core';
import { Subject, of } from 'rxjs';
import { PollingGraphComponent } from './polling-graph.component';
import { TranslationService } from '../i18n/translation.service';
import { PartyService } from '../services/party.service';
import { Poll, MonthlyTrendResponse } from '../models/poll.model';
import { Party } from '../models/party.model';

describe('Monthly support weighting', () => {
  let component: PollingGraphComponent;
  let service: jasmine.SpyObj<PartyService>;
  const poll = (pollster: string, a: number, b?: number): Poll => ({
    id: `${pollster}-${a}`, pollster, media: [], startDate: new Date(), finishDate: new Date(),
    type: '', sample: null, others: 0,
    results: [{ partyId: 'a', value: a }, ...(b === undefined ? [] : [{ partyId: 'b', value: b }])]
  });
  beforeEach(() => {
    service = jasmine.createSpyObj<PartyService>('PartyService', ['getMonthlyTrend', 'getMonthlyPolls']);
    component = new PollingGraphComponent(
      {} as NgZone, { translate: (key: string) => key } as TranslationService,
      service, 'server' as unknown as object
    );
    component.parties = [{ id: 'a', acronym: 'A' }, { id: 'b', acronym: 'B' }] as Party[];
    component.countryCode = 'pl';
    spyOn(component as unknown as { renderGraph(): void }, 'renderGraph');
    component.selectedSupportMonth = '2026-06';
    component.selectedSupportPreviousMonth = '2026-05';
  });
  it('enables equal pollster weighting by default', () => {
    expect(component.equalPollsterWeight).toBeTrue();
    component['buildMonthlySupportPolls']([poll('Alpha', 10), poll('Alpha', 20), poll('Beta', 60)], []);
    expect(component.monthlySupportData[0].results[0].value).toBe(37.5);
  });
  it('supports poll-weighted averages and unrounded pollster means', () => {
    component.equalPollsterWeight = false;
    const polls = [poll('Alpha', 10), poll(' ALPHA ', 20), poll('Beta', 60)];
    component['buildMonthlySupportPolls'](polls, []);
    expect(component.monthlySupportData[0].results[0].value).toBe(30);
    component.equalPollsterWeight = true;
    component['applyMonthlySupportSelection']();
    expect(component.monthlySupportData[0].results[0].value).toBe(37.5);
    const precise = [poll('Alpha', 10.04), poll('Alpha', 10.04), poll('Beta', 10.05)];
    expect(component['buildMonthlyAggregateResults'](precise)[0].value).toBe(10);
  });
  it('uses only matching selected variants in both months, with the same weighting mode', () => {
    component.equalPollsterWeight = true;
    component['buildMonthlySupportPolls'](
      [poll('Alpha', 10), poll('Alpha', 20), poll('Beta', 60), poll('Beta', 90, 10)],
      [poll('Alpha', 20), poll('Alpha', 40), poll('Beta', 50), poll('Beta', 80, 20)]
    );
    expect(component.monthlySupportData.map(p => p.results[0].value)).toEqual([37.5, 40]);
    component.onConfigVariantSingleSelect('A|B');
    expect(component.monthlySupportData.map(p => p.results.find(r => r.partyId === 'a')?.value)).toEqual([90, 80]);
    component.onConfigVariantToggle('A');
    expect(component.monthlySupportData.map(p => p.results.find(r => r.partyId === 'a')?.value)).toEqual([45, 47.5]);
    component.onConfigVariantToggle('A');
    component.onConfigVariantToggle('A|B');
    component['buildMonthlySupportPolls']([poll('Beta', 90, 10)], []);
    expect(component.monthlySupportData).toEqual([]);
  });
  it('does not invent a comparison when the previous month has no matching variant', () => {
    component['buildMonthlySupportPolls']([poll('Alpha', 10)], [poll('Alpha', 20, 30)]);
    expect(component.monthlySupportData.length).toBe(1);
  });
  it('sends weighting and pollster filters to the trend API, and filters monthly data before averaging', () => {
    component.equalPollsterWeight = true;
    component.uniquePollsters = ['Alpha', 'Beta'];
    component.selectedPollsters = new Set(['beta']);
    service.getMonthlyTrend.and.returnValue(of({ availableMonths: ['2026-06'],
      availablePollsters: [{ name: 'Alpha', count: 2 }, { name: 'Beta', count: 1 }],
      pollsters: [{ name: 'Beta', count: 1 }], points: [] }));
    // These pollsters are already known, as they would be after the first load.
    component['allPollsters'] = new Map([['alpha', 'Alpha'], ['beta', 'Beta']]);
    service.getMonthlyPolls.and.callFake((_country, month, options) => of(
      month === '2026-05' ? [] : options?.pollsters ? [poll('Beta', 60)] : [poll('Alpha', 10), poll('Beta', 60)]
    ));
    component['loadTrendData']();
    expect(service.getMonthlyTrend.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({
      equalPollsterWeight: true, pollsters: ['Beta']
    }));
    expect(component.monthlySupportData[0].results[0].value).toBe(60);
    expect(component.monthlyUsedPollsters).toEqual([{ name: 'Beta', count: 1 }]);
  });
  it('ignores monthly responses started before a weighting/filter change', () => {
    const current = new Subject<Poll[]>();
    service.getMonthlyPolls.and.returnValue(current);
    component['loadMonthlySupport']('2026-06');
    service.getMonthlyTrend.and.returnValue(new Subject<MonthlyTrendResponse>());
    component.onEqualPollsterWeightChange(true);
    current.next([poll('Alpha', 99)]);
    current.complete();
    expect(component.monthlySupportData).toEqual([]);
  });
  it('ignores a trend response from the previous weighting mode', () => {
    const oldResponse = new Subject<MonthlyTrendResponse>();
    const newResponse = new Subject<MonthlyTrendResponse>();
    service.getMonthlyTrend.and.returnValues(oldResponse, newResponse);
    component['loadTrendData']();
    component.onEqualPollsterWeightChange(true);
    oldResponse.next({ availableMonths: ['2026-01'], availablePollsters: [], pollsters: [], points: [] });
    expect(component.supportMonthOptions).toEqual([]);
    newResponse.next({ availableMonths: [], availablePollsters: [], pollsters: [], points: [] });
    expect(component.isTrendLoading).toBeFalse();
  });
  it('uses API alias groups for means, counts and filters without renaming individual polls', () => {
    const groupName = 'United Surveys / IBRiS';
    const polls = [poll('United Surveys', 10), poll(' united surveys ', 20),
      poll('United Surveys', 30), poll('IBRiS', 70), poll('Other', 80)];
    service.getMonthlyTrend.and.returnValue(of({
      pollsterGroups: [{ name: groupName, aliases: ['United Surveys', 'IBRiS'] }],
      availableMonths: ['2026-06'],
      availablePollsters: [{ name: groupName, count: 4 }, { name: 'Other', count: 1 }],
      pollsters: [], points: []
    }));
    service.getMonthlyPolls.and.callFake((_country, month, options) => of(
      month === '2026-05' ? [] : options?.pollsters?.includes('Other') ? [polls[4]] : polls
    ));
    component['loadTrendData']();
    expect(component.monthlySupportData[0].results[0].value).toBe(56.3);
    expect(component.uniquePollsters).toContain(groupName);
    expect(component.uniquePollsters).not.toContain('IBRiS');
    expect(component.monthlyUsedPollsters).toContain({ name: groupName, count: 4 });
    expect(polls[3].pollster).toBe('IBRiS');
    component.equalPollsterWeight = false;
    component['applyMonthlySupportSelection']();
    expect(component.monthlySupportData[0].results[0].value).toBe(42);
    component.excludePollster(groupName);
    expect(component.isPollsterSelected('United Surveys')).toBeFalse();
    expect(component.isPollsterSelected('IBRiS')).toBeFalse();
    expect(service.getMonthlyPolls.calls.mostRecent().args[2]?.pollsters).toEqual(['Other']);
    expect(component.monthlySupportData[0].results[0].value).toBe(80);
  });
});
