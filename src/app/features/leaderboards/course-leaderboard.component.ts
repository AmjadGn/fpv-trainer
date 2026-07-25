import { Component, inject } from '@angular/core';
import { AsyncPipe, JsonPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LeaderboardApiService } from '../../core/online/services/leaderboard-api.service';
@Component({standalone:true,imports:[AsyncPipe,JsonPipe,RouterLink],template:`<main class="online-page"><a routerLink="/leaderboards">← Leaderboards</a><h1>Course leaderboard</h1><p>Course: {{courseId}}</p><section class="panel"><pre>{{ rows$ | async | json }}</pre></section></main>`,styles:[`.online-page{width:min(1000px,calc(100% - 2rem));margin:3rem auto}.panel{padding:1.5rem;border:1px solid var(--fpv-border);background:var(--fpv-panel)}a{color:var(--fpv-accent)}`]})
export class CourseLeaderboardComponent { private route=inject(ActivatedRoute); private api=inject(LeaderboardApiService); readonly courseId=this.route.snapshot.paramMap.get('courseId')??''; readonly rows$=this.api.forCourse(this.courseId, { period: 'all', perPage: 25 }); }
