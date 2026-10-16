import { InjectionToken } from '@angular/core';

/** Created for each SSR request; deliberately absent in the browser injector. */
export interface SsrResponseStatus {
  code: number;
}

export const SSR_RESPONSE_STATUS = new InjectionToken<SsrResponseStatus>('SSR_RESPONSE_STATUS');
