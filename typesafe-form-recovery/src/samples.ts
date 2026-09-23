/** Example inputs, from a one-liner to messy notes. */
export const SAMPLES: { name: string; text: string }[] = [
  {
    name: 'One line',
    text: 'I need a form with three fields, name, surname and age',
  },
  {
    name: 'Field spec',
    text: `I want a form with 4 fields:

* field 1: Email, type text, validations email and required
* field 2: Full name, type text, validations required and max length 120 chars
* field 3: Bio, type textarea, validations required and max length 5000 chars
* field 4: Subscribe to newsletter, type checkbox`,
  },
  {
    name: 'Workshop signup',
    text: `Workshop registration form

- Full name (required, at least 3 characters)
- Date of birth
- Experience level: beginner, intermediate or advanced
- Which frameworks do you use? You can pick several: React, Angular, Vue, Lit
- Number of attendees, between 1 and 5
- I accept the privacy policy (required)
- Comments, optional, up to 500 characters`,
  },
  {
    name: 'Notes from a call',
    text: `Client wants a quote request form for the website.

Company name - required
Contact email, must be a valid email, required
Phone number
How did you hear about us? Options: Google, LinkedIn, a friend, other
Budget in euros
Please note the budget is only an estimate, we will come back with a proposal
Project start date
Describe your project, up to 2000 characters
I agree to be contacted (required)`,
  },
];
