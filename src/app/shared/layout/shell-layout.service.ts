/**
 * Shell navigation preference (sidebar expanded/collapsed).
 */
import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'fpv.shell.sidebarExpanded';

@Injectable({ providedIn: 'root' })
export class ShellLayoutService {
  readonly sidebarExpanded = signal(readExpanded());
  readonly mobileMoreOpen = signal(false);

  toggleSidebar(): void {
    const next = !this.sidebarExpanded();
    this.sidebarExpanded.set(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    } catch {
      // Ignore storage failures.
    }
  }

  setSidebarExpanded(expanded: boolean): void {
    this.sidebarExpanded.set(expanded);
    try {
      localStorage.setItem(STORAGE_KEY, expanded ? '1' : '0');
    } catch {
      // Ignore.
    }
  }

  openMobileMore(): void {
    this.mobileMoreOpen.set(true);
  }

  closeMobileMore(): void {
    this.mobileMoreOpen.set(false);
  }

  toggleMobileMore(): void {
    this.mobileMoreOpen.update((v) => !v);
  }
}

function readExpanded(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === '0') {
      return false;
    }
    if (raw === '1') {
      return true;
    }
  } catch {
    // Ignore.
  }
  return true;
}
