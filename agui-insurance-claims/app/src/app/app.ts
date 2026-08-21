import { Component } from '@angular/core';
import { ClaimsPageComponent } from './claims/claims-page.component';

@Component({
  selector: 'app-root',
  imports: [ClaimsPageComponent],
  template: '<app-claims-page />',
})
export class App {}
