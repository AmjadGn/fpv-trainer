import { Injectable } from '@angular/core';

export interface ShareCardOptions {
  title: string;
  detail?: string;
  course?: string;
  time?: string;
  rank?: number;
  verified?: boolean;
  portrait?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ShareCardService {
  create(options: ShareCardOptions): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = options.portrait ? 1080 : 1200;
    canvas.height = options.portrait ? 1920 : 630;
    const context = canvas.getContext('2d');
    if (!context) {
      // jsdom and some headless environments lack canvas 2d — still return sized canvas.
      return canvas;
    }
    context.fillStyle = '#0b1118';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#2ec4b6';
    context.lineWidth = 5;
    context.strokeRect(36, 36, canvas.width - 72, canvas.height - 72);
    context.fillStyle = '#2ec4b6';
    context.font = 'bold 30px Barlow, sans-serif';
    context.fillText('FPV TRAINER', 80, options.portrait ? 160 : 120);
    context.fillStyle = '#e7eef4';
    context.font = 'bold 56px Barlow, sans-serif';
    context.fillText(options.title, 80, options.portrait ? 250 : 220);
    context.fillStyle = '#8fa3b5';
    context.font = '34px Barlow, sans-serif';
    context.fillText(options.course ?? options.detail ?? 'FPV Trainer', 80, options.portrait ? 330 : 290);
    if (options.time) context.fillText(`Time: ${options.time}`, 80, options.portrait ? 385 : 345);
    if (options.rank) context.fillText(`Rank: #${options.rank}`, 80, options.portrait ? 440 : 400);
    context.fillStyle = options.verified ? '#3ddc97' : '#f0b429';
    context.font = 'bold 28px Barlow, sans-serif';
    context.fillText(options.verified ? 'VERIFIED RESULT' : 'LOCAL RESULT', 80, options.portrait ? 500 : 460);
    return canvas;
  }

  downloadImage(options: ShareCardOptions, filename = 'fpv-trainer-result.png'): void {
    const link = document.createElement('a');
    link.download = filename;
    link.href = this.create(options).toDataURL('image/png');
    link.click();
  }

  async copyLink(url: string): Promise<void> {
    await navigator.clipboard?.writeText(url);
  }

  async share(options: ShareCardOptions, url?: string): Promise<boolean> {
    if (!navigator.share) return false;
    await navigator.share({ title: 'FPV Trainer', text: options.title, url });
    return true;
  }
}
