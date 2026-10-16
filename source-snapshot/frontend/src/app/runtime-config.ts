import { InjectionToken } from '@angular/core';
import { environment } from '../environments/environment';

/** Browser address for the public API; overridden with the internal Docker URL in SSR. */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => environment.apiUrl
});

/** Empty in the browser and absolute in SSR, where Node's fetch needs an absolute URL. */
export const ASSET_BASE_URL = new InjectionToken<string>('ASSET_BASE_URL', {
  providedIn: 'root',
  factory: () => ''
});
