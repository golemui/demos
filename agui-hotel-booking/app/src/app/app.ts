import { Component } from '@angular/core';
import { BookingPageComponent } from './booking/booking-page.component';

@Component({
  selector: 'app-root',
  imports: [BookingPageComponent],
  template: '<app-booking-page />',
})
export class App {}
