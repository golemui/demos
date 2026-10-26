import { AngularCatalog, BASIC_COMPONENTS, BASIC_FUNCTIONS, createComponentImplementation } from '@a2ui/angular/v0_9';
import { BasicCatalogThemeSchema } from '@a2ui/web_core/v0_9/basic_catalog';
import { HOTEL_CATALOG_ID } from '@hotel/shared';
import { CheckoutApi, CheckoutComponent } from '../payment/checkout.component';
import { BookingReviewApi, BookingReviewComponent } from './booking-review.component';
import { ContractFormApi, ContractFormComponent } from './contract-form.component';

/**
 * The renderer side of the "A2UI + GolemUI" catalog: every basic component
 * (a v0.9 surface uses exactly one catalog) plus the three GolemUI-backed
 * components. The agent sees the same names via the server's catalog
 * description, under the same id.
 */
export const hotelCatalog = new AngularCatalog(
  HOTEL_CATALOG_ID,
  '0.9',
  [
    ...BASIC_COMPONENTS,
    createComponentImplementation(ContractFormApi, ContractFormComponent),
    createComponentImplementation(BookingReviewApi, BookingReviewComponent),
    createComponentImplementation(CheckoutApi, CheckoutComponent),
  ],
  [...BASIC_FUNCTIONS],
  BasicCatalogThemeSchema,
);
