<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class WeeklyCompetitiveSummary extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(public readonly User $user)
    {
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Your FPV Trainer weekly competitive summary');
    }

    public function content(): Content
    {
        return new Content(text: 'mail.weekly-competitive-summary', with: [
            'pilotName' => $this->user->username ?: 'Pilot',
        ]);
    }
}
