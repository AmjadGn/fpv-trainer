import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly http = inject(HttpClient);
  private readonly cache = new Map<string, Observable<unknown>>();
  readonly manifest = this.http.get<{ files?: string[]; [key: string]: unknown }>('/catalog/manifest.json').pipe(
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  load<T>(name: string): Observable<T> {
    if (!this.cache.has(name)) {
      this.cache.set(name, this.http.get<T>(`/catalog/${name}.json`).pipe(shareReplay({ bufferSize: 1, refCount: false })));
    }
    return this.cache.get(name)! as Observable<T>;
  }
}
