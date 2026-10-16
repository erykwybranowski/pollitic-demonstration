import {
  Component,
  Input,
  OnDestroy,
  OnInit,
  ViewChild,
  ElementRef,
  NgZone,
  HostListener,
  EventEmitter,
  Output,
  OnChanges,
  SimpleChanges
} from '@angular/core';
import { Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, NgClass, NgForOf, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MonthlyTrendResponse, Poll } from '../models/poll.model';
import { Party } from '../models/party.model';
import { Chart, registerables } from 'chart.js';
import { Group } from '../models/group.model';
import { SupportGraphComponent } from '../support-graph/support-graph.component';
import { forkJoin, Subscription } from 'rxjs';
import { TranslationPipe } from '../i18n/translation.pipe';
import { TranslationService } from '../i18n/translation.service';
import { PartyService } from '../services/party.service';

interface MonthlyConfigOption {
  key: string;
  label: string;
  pollCount: number;
}

interface PollsterUsage {
  name: string;
  count: number;
}
@Component({
  selector: 'app-polling-graph',
  standalone: true,
  imports: [NgIf, NgForOf, NgClass, FormsModule, SupportGraphComponent, TranslationPipe],
  templateUrl: './polling-graph.component.html',
  styleUrls: ['./polling-graph.component.scss']
})
export class PollingGraphComponent implements OnInit, OnDestroy, OnChanges {
  @Input() countryCode: string = '';
  @Input() parties: Party[] = [];
  @Input() area?: string;
  @Output() partySelected = new EventEmitter<string>();
  @ViewChild('pollingGraphCanvas', { static: true })
  canvasRef!: ElementRef<HTMLCanvasElement>;

  chart: Chart | null = null;
  colorsUsed: Record<string, number> = {};
  partyColors: Record<string, string> = {};
  rangeMode: '1y' | '2y' | '5y' | 'max' | 'custom' = '5y';
  allMonths: string[] = [];
  filteredMonths: string[] = [];
  customStartMonth: string | null = null;
  customEndMonth: string | null = null;
  showPollsterFilters = false;
  equalPollsterWeight = true;
  uniquePollsters: string[] = [];
  selectedPollsters: Set<string> = new Set<string>();
  supportMonthOptions: string[] = [];
  selectedSupportMonth: string | null = null;
  selectedSupportPreviousMonth: string | null = null;
  monthlySupportData: Poll[] = [];
  monthlySupportParties: Party[] = [];
  monthlyUsedPollsters: PollsterUsage[] = [];
  monthlyAvailablePollsters: PollsterUsage[] = [];
  timeSeriesUsedPollsters: PollsterUsage[] = [];
  timeSeriesAvailablePollsters: PollsterUsage[] = [];
  configOptions: MonthlyConfigOption[] = [];
  selectedConfigKeys: Set<string> = new Set<string>();
  isTrendLoading = false;
  isMonthlySupportLoading = false;

  private previousWidth = 1024;
  private readonly isBrowser: boolean;
  private subscriptions: Subscription[] = [];
  private initialized = false;
  private trendData: MonthlyTrendResponse | null = null;
  private allPollsters: Map<string, string> = new Map<string, string>();
  private pollsterGroupNames = new Map<string, string>();
  private trendRequestSeq = 0;
  private supportRequestSeq = 0;
  private lastMonthlySupportPolls: Poll[] = [];
  private lastMonthlySupportPreviousPolls: Poll[] = [];

  constructor(
    private ngZone: NgZone,
    private i18n: TranslationService,
    private partyService: PartyService,
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
    if (this.isBrowser) {
      Chart.register(...registerables);
    }
  }

  ngOnInit(): void {
    if (!this.isBrowser) {
      return;
    }

    this.rangeMode = window.innerWidth <= 768 ? '2y' : '5y';
    this.previousWidth = window.innerWidth;
    this.initialized = true;
    this.loadTrendData();

    const languageSub = this.i18n.language$.subscribe(() => {
      this.renderGraph();
      if (this.selectedSupportMonth) {
        this.buildMonthlySupportPolls(this.lastMonthlySupportPolls);
      }
    });
    this.subscriptions.push(languageSub);
  }

  ngOnChanges(_changes: SimpleChanges): void {
    if (!this.initialized) {
      return;
    }

    this.trendData = null;
    this.allPollsters.clear();
    this.pollsterGroupNames.clear();
    this.selectedPollsters.clear();
    this.uniquePollsters = [];
    this.monthlySupportData = [];
    this.monthlySupportParties = [];
    this.monthlyUsedPollsters = [];
    this.monthlyAvailablePollsters = [];
    this.timeSeriesAvailablePollsters = [];
    this.configOptions = [];
    this.selectedConfigKeys.clear();
    this.lastMonthlySupportPolls = [];
    this.lastMonthlySupportPreviousPolls = [];
    this.loadTrendData();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(subscription => subscription.unsubscribe());
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }

  @HostListener('window:resize', [])
  onResize(): void {
    if (!this.isBrowser) {
      return;
    }

    const currentWidth = window.innerWidth;
    if (currentWidth !== this.previousWidth) {
      this.previousWidth = currentWidth;
      this.colorsUsed = {};
      this.partyColors = {};
      this.renderGraph();
    }
  }

  onRangeButtonClick(mode: '1y' | '2y' | '5y' | 'max' | 'custom'): void {
    if (mode === 'custom') {
      if (!this.customStartMonth || !this.customEndMonth) {
        const source = this.filteredMonths.length ? this.filteredMonths : this.allMonths;
        this.customStartMonth = source[0] ?? null;
        this.customEndMonth = source[source.length - 1] ?? null;
      }
      this.rangeMode = mode;
      return;
    }

    this.customStartMonth = null;
    this.customEndMonth = null;
    this.rangeMode = mode;
    this.loadTrendData();
  }

  onCustomRangeChange(): void {
    this.loadTrendData();
  }

  togglePollsterFilters(): void {
    this.showPollsterFilters = !this.showPollsterFilters;
  }

  onEqualPollsterWeightChange(enabled: boolean): void {
    this.equalPollsterWeight = enabled;
    this.applyMonthlySupportSelection();
    this.loadTrendData();
  }

  togglePollster(name: string): void {
    const key = this.pollsterKey(name);
    if (this.selectedPollsters.has(key)) {
      this.selectedPollsters.delete(key);
    } else {
      this.selectedPollsters.add(key);
    }
    this.loadTrendData();
  }

  excludePollster(name: string): void {
    const key = this.pollsterKey(name);
    if (!this.selectedPollsters.has(key)) {
      return;
    }

    this.selectedPollsters.delete(key);
    this.loadTrendData();
  }

  restorePollster(name: string): void {
    const key = this.pollsterKey(name);
    if (this.selectedPollsters.has(key)) {
      return;
    }

    this.selectedPollsters.add(key);
    this.loadTrendData();
  }

  getMonthlyExcludedPollsters(): PollsterUsage[] {
    if (this.getSelectedPollstersForRequest() === null) {
      return [];
    }
    return this.monthlyAvailablePollsters.filter(pollster => !this.isPollsterSelected(pollster.name));
  }

  getTimeSeriesExcludedPollsters(): PollsterUsage[] {
    return this.timeSeriesAvailablePollsters.filter(pollster => !this.isPollsterSelected(pollster.name));
  }

  selectAllPollsters(): void {
    this.uniquePollsters.forEach(name => this.selectedPollsters.add(this.pollsterKey(name)));
    this.loadTrendData();
  }

  deselectAllPollsters(): void {
    this.selectedPollsters.clear();
    this.loadTrendData();
  }

  isPollsterSelected(name: string): boolean {
    return this.selectedPollsters.has(this.pollsterKey(name));
  }

  onSupportMonthChange(): void {
    if (!this.selectedSupportMonth) {
      this.monthlySupportData = [];
      this.monthlySupportParties = [];
      this.monthlyUsedPollsters = [];
      this.monthlyAvailablePollsters = [];
      return;
    }

    this.loadMonthlySupport(this.selectedSupportMonth);
  }

  goToPreviousSupportMonth(): void {
    const index = this.getSelectedSupportMonthIndex();
    if (index <= 0) {
      return;
    }

    this.selectedSupportMonth = this.supportMonthOptions[index - 1];
    this.onSupportMonthChange();
  }

  goToNextSupportMonth(): void {
    const index = this.getSelectedSupportMonthIndex();
    if (index < 0 || index >= this.supportMonthOptions.length - 1) {
      return;
    }

    this.selectedSupportMonth = this.supportMonthOptions[index + 1];
    this.onSupportMonthChange();
  }

  isPreviousSupportMonthDisabled(): boolean {
    return this.getSelectedSupportMonthIndex() <= 0;
  }

  isNextSupportMonthDisabled(): boolean {
    const index = this.getSelectedSupportMonthIndex();
    return index < 0 || index >= this.supportMonthOptions.length - 1;
  }

  private getSelectedSupportMonthIndex(): number {
    return this.selectedSupportMonth ? this.supportMonthOptions.indexOf(this.selectedSupportMonth) : -1;
  }

  formatMonthLabel(month: string): string {
    const [year, m] = month.split('-');
    return `${m}.${year}`;
  }

  onPartySelected(partyAcronym: string): void {
    this.partySelected.emit(partyAcronym);
  }

  private loadTrendData(): void {
    if (!this.countryCode) {
      this.resetDerivedData();
      return;
    }

    const requestSeq = ++this.trendRequestSeq;
    // A filter/weight change must also invalidate in-flight monthly responses.
    ++this.supportRequestSeq;
    const range = this.getRequestRange();
    this.isTrendLoading = true;

    this.partyService.getMonthlyTrend(this.countryCode, {
      fromMonth: range.fromMonth,
      toMonth: range.toMonth,
      area: this.area ?? null,
      pollsters: this.getSelectedPollstersForRequest(),
      equalPollsterWeight: this.equalPollsterWeight
    }).subscribe({
      next: response => {
        if (requestSeq !== this.trendRequestSeq) {
          return;
        }
        this.isTrendLoading = false;
        this.trendData = response;
        this.pollsterGroupNames.clear();
        for (const group of response.pollsterGroups ?? []) {
          for (const alias of [group.name, ...group.aliases]) {
            this.pollsterGroupNames.set(alias.trim().toLowerCase(), group.name);
          }
        }
        this.applyPollsterOptions(response);
        this.allMonths = response.availableMonths ?? [];
        this.supportMonthOptions = [...this.allMonths];
        this.filteredMonths = this.buildVisibleMonths(response.availableMonths ?? [], range.fromMonth, range.toMonth);
        this.updateTimeSeriesUsedPollsters(response);
        this.timeSeriesAvailablePollsters = this.buildPollsterUsageList(response.availablePollsters ?? []);
        this.renderGraph();
        this.ensureSelectedSupportMonth();
      },
      error: () => {
        if (requestSeq !== this.trendRequestSeq) {
          return;
        }
        this.isTrendLoading = false;
        this.resetDerivedData();
      }
    });
  }

  private loadMonthlySupport(month: string): void {
    const requestSeq = ++this.supportRequestSeq;
    this.isMonthlySupportLoading = true;
    const previousMonth = this.getPreviousMonth(month);

    forkJoin({
      current: this.partyService.getMonthlyPolls(this.countryCode, month, {
        area: this.area ?? null,
        pollsters: this.getSelectedPollstersForRequest()
      }),
      available: this.partyService.getMonthlyPolls(this.countryCode, month, {
        area: this.area ?? null,
        pollsters: null
      }),
      previous: this.partyService.getMonthlyPolls(this.countryCode, previousMonth, {
        area: this.area ?? null,
        pollsters: this.getSelectedPollstersForRequest()
      })
    }).subscribe({
      next: ({ current, previous, available }) => {
        if (requestSeq !== this.supportRequestSeq) {
          return;
        }
        this.isMonthlySupportLoading = false;
        this.selectedSupportPreviousMonth = previousMonth;
        this.monthlyAvailablePollsters = this.buildPollsterUsageListFromPolls(available);
        this.buildMonthlySupportPolls(current, previous);
      },
      error: () => {
        if (requestSeq !== this.supportRequestSeq) {
          return;
        }
        this.isMonthlySupportLoading = false;
        this.lastMonthlySupportPolls = [];
        this.lastMonthlySupportPreviousPolls = [];
        this.selectedSupportPreviousMonth = null;
        this.configOptions = [];
        this.selectedConfigKeys.clear();
        this.monthlySupportData = [];
        this.monthlySupportParties = [];
        this.monthlyUsedPollsters = [];
        this.monthlyAvailablePollsters = [];
      }
    });
  }

  private renderGraph(): void {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }

    if (!this.trendData || !this.filteredMonths.length) {
      this.timeSeriesUsedPollsters = [];
      return;
    }

    const partySupportOverTime = this.processTrendPointsForMonths(this.filteredMonths);
    const canvasElement = this.canvasRef.nativeElement;
    if (canvasElement) {
      canvasElement.height = window.innerWidth <= 768 ? 340 : 500;
    }

    const sortedParties = Object.keys(partySupportOverTime)
      .filter(party => partySupportOverTime[party].some(entry => entry.value > 0))
      .sort((a, b) => {
        const groupCountA = this.getPartyByAcronym(a)?.groups?.size || 0;
        const groupCountB = this.getPartyByAcronym(b)?.groups?.size || 0;
        return groupCountA - groupCountB;
      });

    this.colorsUsed = {};
    this.partyColors = {};
    this.getPartyColor(sortedParties);

    const pointRadius = window.innerWidth <= 768 ? 0 : 2;
    const datasets = sortedParties
      .sort((a, b) => {
        const averageA = this.average(partySupportOverTime[a].map(entry => entry.value).filter(value => value > 0));
        const averageB = this.average(partySupportOverTime[b].map(entry => entry.value).filter(value => value > 0));
        return averageA - averageB;
      })
      .map(party => ({
        label: party,
        data: partySupportOverTime[party].map(entry => entry.value > 0 ? entry.value : null),
        borderColor: this.partyColors[party],
        backgroundColor: this.withAlpha(this.partyColors[party], 0.18),
        borderWidth: 2.4,
        pointRadius,
        pointHoverRadius: pointRadius > 0 ? pointRadius + 3 : 4,
        pointHitRadius: 12,
        pointBorderWidth: 2,
        pointBackgroundColor: '#ffffff',
        pointBorderColor: this.partyColors[party],
        tension: 0.3,
        spanGaps: true,
        fill: false
      }));

    const labels = this.filteredMonths;
    const maxSupport = Math.max(
      ...datasets.flatMap(dataset => dataset.data.filter((value): value is number => value !== null)),
      0
    );
    const ySuggestedMax = maxSupport <= 10 ? 12 : Math.ceil((maxSupport + 4) / 5) * 5;

    this.ngZone.runOutsideAngular(() => {
      this.chart = new Chart(canvasElement, {
        type: 'line',
        data: { labels, datasets },
        plugins: [
          {
            id: 'pollingChartAreaBackground',
            beforeDraw: (chart) => {
              const { ctx, chartArea } = chart;
              if (!chartArea) return;
              const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
              gradient.addColorStop(0, 'rgba(59, 130, 246, 0.08)');
              gradient.addColorStop(1, 'rgba(59, 130, 246, 0.01)');
              ctx.save();
              ctx.fillStyle = gradient;
              ctx.fillRect(chartArea.left, chartArea.top, chartArea.right - chartArea.left, chartArea.bottom - chartArea.top);
              ctx.restore();
            }
          }
        ],
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'nearest', intersect: false },
          animation: { duration: 450 },
          plugins: {
            legend: {
              position: 'bottom',
              reverse: true,
              labels: {
                color: '#1e293b',
                font: { size: 11, weight: 600 },
                padding: 12,
                usePointStyle: true,
                pointStyle: 'line',
                boxWidth: 30
              }
            },
            tooltip: {
              backgroundColor: 'rgba(15, 23, 42, 0.92)',
              borderColor: 'rgba(148, 163, 184, 0.4)',
              borderWidth: 1,
              titleColor: '#f8fafc',
              bodyColor: '#e2e8f0',
              displayColors: true,
              padding: 10,
              callbacks: {
                title: (items) => {
                  const month = String(items[0]?.label || '');
                  return this.i18n.translate('pollingGraph.chart.tooltip.month', { month: this.formatMonthLabel(month) });
                },
                label: (context) => {
                  const value = context.parsed.y;
                  if (value === null || value === undefined) {
                    return this.i18n.translate('pollingGraph.chart.tooltip.missingData', { label: context.dataset.label });
                  }
                  return context.dataset.label + ': ' + Number(value).toFixed(1) + '%';
                }
              }
            }
          },
          scales: {
            x: {
              grid: { color: 'rgba(148, 163, 184, 0.2)', drawTicks: false },
              ticks: {
                color: '#475569',
                maxTicksLimit: window.innerWidth <= 768 ? 6 : 12,
                callback: (_value, index) => this.toCompactMonthLabel(labels[index] || '')
              },
              title: {
                display: true,
                text: this.i18n.translate('pollingGraph.chart.axis.month'),
                color: '#334155',
                font: { weight: 700 }
              }
            },
            y: {
              beginAtZero: true,
              suggestedMax: ySuggestedMax,
              grace: '3%',
              grid: { color: 'rgba(148, 163, 184, 0.24)' },
              ticks: { color: '#475569', callback: value => `${value}%` },
              title: {
                display: true,
                text: this.i18n.translate('pollingGraph.chart.axis.support'),
                color: '#334155',
                font: { weight: 700 }
              }
            }
          }
        }
      });
    });
  }

  private resetDerivedData(): void {
    this.trendData = null;
    this.allMonths = [];
    this.filteredMonths = [];
    this.uniquePollsters = [];
    this.timeSeriesUsedPollsters = [];
    this.supportMonthOptions = [];
    this.monthlySupportData = [];
    this.monthlySupportParties = [];
    this.monthlyUsedPollsters = [];
    this.configOptions = [];
    this.selectedConfigKeys.clear();
    this.lastMonthlySupportPolls = [];
    this.lastMonthlySupportPreviousPolls = [];
    this.selectedSupportPreviousMonth = null;
  }

  private getRequestRange(): { fromMonth: string | null; toMonth: string | null } {
    if (this.rangeMode === 'max') {
      return { fromMonth: null, toMonth: null };
    }

    if (this.rangeMode === 'custom') {
      return {
        fromMonth: this.customStartMonth,
        toMonth: this.customEndMonth
      };
    }

    const monthsCount = this.rangeMode === '1y' ? 12 : this.rangeMode === '2y' ? 24 : 60;
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    const start = new Date(end);
    start.setMonth(start.getMonth() - (monthsCount - 1));

    return {
      fromMonth: this.toMonthString(start),
      toMonth: this.toMonthString(end)
    };
  }

  private buildVisibleMonths(availableMonths: string[], fromMonth: string | null, toMonth: string | null): string[] {
    if (!availableMonths.length && (!fromMonth || !toMonth)) {
      return [];
    }

    const startMonth = fromMonth ?? availableMonths[0];
    const now = new Date();
    const currentMonth = this.toMonthString(new Date(now.getFullYear(), now.getMonth(), 1));
    const endMonth = toMonth ?? currentMonth;

    if (!startMonth || !endMonth) {
      return [];
    }

    const start = this.parseMonth(startMonth <= endMonth ? startMonth : endMonth);
    const end = this.parseMonth(startMonth <= endMonth ? endMonth : startMonth);
    const months: string[] = [];
    const cursor = new Date(start);

    while (cursor <= end) {
      months.push(this.toMonthString(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }

    return months;
  }

  private applyPollsterOptions(response: MonthlyTrendResponse): void {
    const pollsters = this.buildPollsterUsageList(response.availablePollsters ?? []);

    for (const pollster of pollsters) {
      const key = this.pollsterKey(pollster.name);
      if (!this.allPollsters.has(key)) {
        this.allPollsters.set(key, pollster.name);
        this.selectedPollsters.add(key);
      }
    }

    this.uniquePollsters = Array.from(this.allPollsters.values()).sort();
    this.selectedPollsters = new Set(Array.from(this.selectedPollsters).filter(key => this.allPollsters.has(key)));
  }

  private getSelectedPollstersForRequest(): string[] | null {
    if (!this.uniquePollsters.length) {
      return null;
    }

    const selected = this.uniquePollsters.filter(pollster => this.isPollsterSelected(pollster));
    if (selected.length === this.uniquePollsters.length) {
      return null;
    }

    return selected;
  }

  private ensureSelectedSupportMonth(): void {
    if (!this.supportMonthOptions.length) {
      this.selectedSupportMonth = null;
      this.monthlySupportData = [];
      this.monthlySupportParties = [];
      this.monthlyUsedPollsters = [];
      return;
    }

    if (!this.selectedSupportMonth || !this.supportMonthOptions.includes(this.selectedSupportMonth)) {
      this.selectedSupportMonth = this.supportMonthOptions[this.supportMonthOptions.length - 1];
    }

    this.loadMonthlySupport(this.selectedSupportMonth);
  }

  private processTrendPointsForMonths(months: string[]): Record<string, { month: string; value: number }[]> {
    const pointsByMonth = new Map((this.trendData?.points ?? []).map(point => [point.month, point] as const));
    const support = new Map<string, Map<string, number>>();

    for (const month of months) {
      const point = pointsByMonth.get(month);
      if (!point) {
        continue;
      }

      for (const result of point.results) {
        if (result.average <= 0) {
          continue;
        }
        if (!support.has(result.partyId)) {
          support.set(result.partyId, new Map<string, number>());
        }
        support.get(result.partyId)!.set(month, result.average);
      }
    }

    const response: Record<string, { month: string; value: number }[]> = {};
    for (const [partyId, monthMap] of support.entries()) {
      const party = this.parties.find(p => p.id === partyId);
      if (!party?.acronym) continue;
      response[party.acronym] = months.map(month => ({
        month,
        value: monthMap.get(month) ?? 0
      }));
    }

    return response;
  }

  isConfigSelected(configKey: string): boolean {
    return this.selectedConfigKeys.has(configKey);
  }

  onConfigVariantCheckboxClick(configKey: string, event: MouseEvent): void {
    event.stopPropagation();
    this.onConfigVariantToggle(configKey);
  }

  onConfigVariantSingleSelect(configKey: string): void {
    if (this.selectedConfigKeys.size === 1 && this.selectedConfigKeys.has(configKey)) {
      this.applyMonthlySupportSelection();
      return;
    }

    this.selectedConfigKeys = new Set<string>([configKey]);
    this.applyMonthlySupportSelection();
  }

  onConfigVariantToggle(configKey: string): void {
    if (this.selectedConfigKeys.has(configKey)) {
      this.selectedConfigKeys.delete(configKey);
    } else {
      this.selectedConfigKeys.add(configKey);
    }
    this.applyMonthlySupportSelection();
  }

  private buildMonthlySupportPolls(polls: Poll[], previousPolls = this.lastMonthlySupportPreviousPolls): void {
    this.lastMonthlySupportPolls = polls;
    this.lastMonthlySupportPreviousPolls = previousPolls;
    const hadConfigOptions = this.configOptions.length > 0;
    const previousSelection = new Set(this.selectedConfigKeys);
    const configMap = this.buildMonthlyConfigMap(polls);

    this.configOptions = Array.from(configMap.entries())
      .map(([key, item]) => ({
        key,
        label: this.i18n.translate('pollingGraph.configOptionLabel', {
          parties: item.partiesLabel,
          count: item.polls.length
        }),
        pollCount: item.polls.length
      }))
      .sort((a, b) => b.pollCount !== a.pollCount ? b.pollCount - a.pollCount : a.label.localeCompare(b.label));

    const availableKeys = new Set(this.configOptions.map(option => option.key));
    this.selectedConfigKeys = new Set(Array.from(previousSelection).filter(key => availableKeys.has(key)));
    if (!this.selectedConfigKeys.size && this.configOptions.length && (!hadConfigOptions || previousSelection.size > 0)) {
      this.selectedConfigKeys.add(this.configOptions[0].key);
    }

    this.applyMonthlySupportSelection(configMap);
  }

  private applyMonthlySupportSelection(configMap = this.buildMonthlyConfigMap(this.lastMonthlySupportPolls)): void {
    if (!this.selectedSupportMonth) {
      this.monthlySupportData = [];
      this.monthlySupportParties = [];
      this.monthlyUsedPollsters = [];
      return;
    }

    const selectedPolls = Array.from(configMap.entries())
      .filter(([key]) => this.selectedConfigKeys.has(key))
      .flatMap(([, item]) => item.polls);

    const aggregate = this.buildMonthlyAggregateResults(selectedPolls);
    const previousPolls = this.lastMonthlySupportPreviousPolls.filter(poll => {
      const config = this.getPollConfiguration(poll);
      return config !== null && this.selectedConfigKeys.has(config.key);
    });
    const previousAggregate = this.buildMonthlyAggregateResults(previousPolls);
    const visiblePartyIds = new Set(aggregate.map(result => result.partyId));

    this.monthlySupportParties = this.parties.filter(party => visiblePartyIds.has(party.id));
    this.monthlySupportData = aggregate.length
      ? [
          this.buildMonthlyPollObject(this.selectedSupportMonth, aggregate),
          ...(previousAggregate.length && this.selectedSupportPreviousMonth
            ? [this.buildMonthlyPollObject(this.selectedSupportPreviousMonth, previousAggregate)]
            : [])
        ]
      : [];
    this.monthlyUsedPollsters = this.buildPollsterUsageListFromPolls(selectedPolls);
  }

  private buildMonthlyPollObject(month: string, results: { partyId: string; value: number }[]): Poll {
    const [yearStr, monthStr] = month.split('-');
    const year = Number(yearStr);
    const monthIndex = Number(monthStr) - 1;

    return {
      id: `monthly-${this.area ?? 'country'}-${month}`,
      pollster: this.i18n.translate('pollingGraph.monthlyAveragePollster'),
      media: [],
      startDate: new Date(year, monthIndex, 1),
      finishDate: new Date(year, monthIndex + 1, 0),
      type: 'monthly-average',
      sample: null,
      results,
      others: 0,
      area: this.area
    };
  }

  private buildMonthlyConfigMap(polls: Poll[]): Map<string, { polls: Poll[]; partiesLabel: string }> {
    const rawConfigMap = new Map<string, { polls: Poll[]; acronyms: string[] }>();

    for (const poll of polls) {
      const config = this.getPollConfiguration(poll);
      if (!config) {
        continue;
      }

      const existing = rawConfigMap.get(config.key);
      if (existing) {
        existing.polls.push(poll);
      } else {
        rawConfigMap.set(config.key, {
          polls: [poll],
          acronyms: config.acronyms
        });
      }
    }

    const keys = Array.from(rawConfigMap.keys());
    const commonAcronyms = this.getCommonConfigAcronyms(keys);
    const configMap = new Map<string, { polls: Poll[]; partiesLabel: string }>();

    for (const key of keys) {
      const item = rawConfigMap.get(key)!;
      const diffAcronyms = item.acronyms.filter(acronym => !commonAcronyms.has(acronym));
      configMap.set(key, {
        polls: item.polls,
        partiesLabel: diffAcronyms.length ? diffAcronyms.join(', ') : '-'
      });
    }

    return configMap;
  }

  private getPollConfiguration(poll: Poll): { key: string; acronyms: string[] } | null {
    const acronyms = poll.results
      .filter(result => result.value > 0)
      .map(result => this.parties.find(p => p.id === result.partyId)?.acronym?.trim().toUpperCase() ?? null)
      .filter((acronym): acronym is string => !!acronym)
      .filter((acronym, index, list) => list.indexOf(acronym) === index)
      .sort((a, b) => a.localeCompare(b));

    if (!acronyms.length) {
      return null;
    }

    return {
      key: acronyms.join('|'),
      acronyms
    };
  }

  private getCommonConfigAcronyms(configKeys: string[]): Set<string> {
    if (!configKeys.length) {
      return new Set<string>();
    }

    let common = new Set(configKeys[0].split('|'));
    for (let index = 1; index < configKeys.length; index++) {
      const current = new Set(configKeys[index].split('|'));
      common = new Set(Array.from(common).filter(acronym => current.has(acronym)));
    }

    return common;
  }

  private buildMonthlyAggregateResults(polls: Poll[]): { partyId: string; value: number }[] {
    const aggregates = new Map<string, Map<string, { sum: number; count: number }>>();
    const knownPartyIds = new Set(this.parties.map(party => party.id));

    for (const poll of polls) {
      for (const result of poll.results) {
        if (result.value <= 0 || !knownPartyIds.has(result.partyId)) {
          continue;
        }

        const groups = aggregates.get(result.partyId) ?? new Map<string, { sum: number; count: number }>();
        const key = this.equalPollsterWeight ? this.pollsterKey(poll.pollster ?? '') : '';
        const current = groups.get(key) ?? { sum: 0, count: 0 };
        current.sum += result.value;
        current.count += 1;
        groups.set(key, current);
        aggregates.set(result.partyId, groups);
      }
    }

    return Array.from(aggregates.entries())
      .map(([partyId, groups]) => {
        // With equal weighting each group is a pollster; otherwise all polls
        // belong to one group. Missing party results do not contribute zeros.
        const mean = Array.from(groups.values())
          .reduce((sum, group) => sum + group.sum / group.count, 0) / groups.size;
        return { partyId, value: Math.round(mean * 10) / 10 };
      })
      .filter(result => result.value > 0)
      .sort((a, b) => b.value - a.value);
  }

  private buildPollsterUsageListFromPolls(polls: Poll[]): PollsterUsage[] {
    const counts = new Map<string, number>();
    for (const poll of polls) {
      if (!poll.pollster) {
        continue;
      }
      counts.set(poll.pollster, (counts.get(poll.pollster) ?? 0) + 1);
    }

    return this.buildPollsterUsageList(Array.from(counts, ([name, count]) => ({ name, count })));
  }
  private updateTimeSeriesUsedPollsters(response: MonthlyTrendResponse): void {
    this.timeSeriesUsedPollsters = this.buildPollsterUsageList(response.pollsters ?? []);
  }

  private buildPollsterUsageList(pollsters: PollsterUsage[]): PollsterUsage[] {
    const grouped = new Map<string, PollsterUsage>();
    for (const pollster of [...pollsters].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))) {
      const key = this.pollsterKey(pollster.name);
      if (!key) {
        continue;
      }
      const existing = grouped.get(key);
      if (existing) {
        existing.count += pollster.count;
      } else {
        grouped.set(key, { name: this.pollsterGroupNames.get(key) ?? pollster.name.trim(), count: pollster.count });
      }
    }

    return Array.from(grouped.values())
      .sort((a, b) => b.count !== a.count ? b.count - a.count : a.name.localeCompare(b.name));
  }

  private pollsterKey(name: string): string {
    const key = name.trim().toLowerCase();
    return (this.pollsterGroupNames.get(key) ?? key).toLowerCase();
  }

  private toMonthString(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${year}-${month}`;
  }

  private parseMonth(month: string): Date {
    const [year, monthNumber] = month.split('-').map(Number);
    return new Date(year, monthNumber - 1, 1);
  }

  private getPreviousMonth(month: string): string {
    const previous = this.parseMonth(month);
    previous.setMonth(previous.getMonth() - 1);
    return this.toMonthString(previous);
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
  }

  private withAlpha(color: string, alpha: number): string {
    const match = color.match(/rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)/i);
    if (!match) return color;
    const [, r, g, b] = match;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  private toCompactMonthLabel(month: string): string {
    const [year, monthNumber] = month.split('-');
    if (!year || !monthNumber) return month;
    return `${monthNumber}/${year.slice(2)}`;
  }

  private getPartyColor(parties: string[]): void {
    for (let party of parties) {
      let groups = new Set<Group>();

      if (party.includes('+')) {
        party.split('+').forEach((acronym) => {
          let groupSet = this.parties.find(p =>
            p.acronym.toUpperCase() === acronym.toUpperCase() ||
            p.stringId.toUpperCase() === acronym.toUpperCase()
          )?.groups;
          if (groupSet) groupSet.forEach(group => groups.add(group));
        });
      } else {
        let groupSet = this.parties.find(p =>
          p.acronym.toUpperCase() === party.toUpperCase() ||
          p.stringId.toUpperCase() === party.toUpperCase()
        )?.groups;
        if (groupSet) groupSet.forEach(group => groups.add(group));
      }

      if (groups.size > 0) {
        const firstGroup = groups.values().next().value;
        if (!firstGroup) {
          this.partyColors[party] = 'gray';
          continue;
        }

        let selectedGroup: Group = firstGroup;
        if (groups.size > 1) {
          selectedGroup = Array.from(groups).reduce((leastUsedGroup: Group, currentGroup: Group) => {
            const currentUsage = this.colorsUsed[currentGroup.acronym] || 0;
            const leastUsage = leastUsedGroup ? this.colorsUsed[leastUsedGroup.acronym] || 0 : Infinity;
            return currentUsage < leastUsage ? currentGroup : leastUsedGroup;
          }, selectedGroup);
        }

        this.colorsUsed[selectedGroup.acronym] = (this.colorsUsed[selectedGroup.acronym] ?? 0) + 1;
        this.partyColors[party] = `rgb(${selectedGroup.r}, ${selectedGroup.g}, ${selectedGroup.b})`;
      } else {
        this.partyColors[party] = 'gray';
      }
    }
  }

  private getPartyByAcronym(acronym: string): Party | undefined {
    return this.parties.find(party => party.acronym === acronym);
  }
}







