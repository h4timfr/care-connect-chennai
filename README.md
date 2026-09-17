# Clinic Connect

Build a polished, production-quality prototype for a healthcare discovery, appointment booking, and clinic communication platform.

WORKING PRODUCT NAME:

CareConnect

CORE CONCEPT:

CareConnect is a healthcare access platform initially focused on independent and smaller clinics in Chennai, India.

The problem:

Large hospitals usually have their own appointment systems, but thousands of smaller clinics and independent doctors are fragmented across phone calls, WhatsApp, Google listings, and individual websites. Patients have to search for each clinic separately, call receptionists, ask about availability, and then arrange appointments.

CareConnect brings these independent clinics and doctors into one platform.

A patient should be able to:

1. Discover doctors and clinics.

2. Search by medical specialty, location, availability, consultation fee, language, and other useful filters.

3. View verified doctor and clinic profiles.

4. See available appointment slots.

5. Book an appointment.

6. Manage upcoming and previous appointments.

7. Communicate with the clinic/doctor through in-app messaging without exposing personal phone numbers.

8. Eventually interact with an AI-powered appointment assistant.

A clinic should be able to:

1. Create and manage its clinic profile.

2. Add doctors.

3. Define doctor schedules and appointment availability.

4. Manage bookings.

5. Communicate with patients.

6. Eventually use an AI receptionist/appointment assistant.

7. View useful clinic analytics.

IMPORTANT PRODUCT POSITIONING:

Do NOT make this look like a generic hospital website.

The product should feel like a modern consumer technology platform combining:

- the discovery simplicity of Airbnb

- the clean usability of Apple Health

- the polished interaction patterns of modern fintech apps

- the practical functionality of a professional clinic management dashboard

The product should feel trustworthy, calm, premium, modern, and extremely easy to use.

TARGET USERS:

1. Patients

2. Doctors

3. Clinic owners/receptionists/admin staff

INITIAL GEOGRAPHY:

Chennai, Tamil Nadu, India.

Use realistic Chennai neighborhoods in mock data such as:

- Adyar

- Anna Nagar

- Velachery

- T. Nagar

- Nungambakkam

- Tambaram

- Porur

- Mylapore

- OMR

- Besant Nagar

Do NOT imply that the displayed clinics or doctors are real verified providers. Clearly treat all prototype data as fictional/demo data.

==================================================

DESIGN SYSTEM

==================================================

Create a premium, modern healthcare interface.

Visual direction:

- Clean and spacious.

- Strong typography hierarchy.

- Rounded cards, but avoid excessive "bubble" UI.

- Subtle shadows.

- Excellent whitespace.

- Professional healthcare aesthetic.

- Use a restrained color system with a primary healthcare color, neutral backgrounds, and clear semantic colors.

- Avoid childish medical illustrations.

- Avoid generic stock imagery.

- Avoid the appearance of an outdated hospital management system.

- Avoid excessive gradients.

- Use icons consistently.

- Make accessibility and readability a priority.

Typography should feel modern and highly legible.

Design for:

- desktop

- tablet

- mobile

The patient experience should be mobile-first.

The clinic dashboard should be optimized for desktop but remain responsive.

==================================================

APPLICATION STRUCTURE

==================================================

Create two major experiences inside the same product:

PATIENT EXPERIENCE

and

CLINIC PORTAL.

Use role-aware navigation.

PATIENT NAVIGATION:

Desktop:

- Home

- Find Doctors

- Appointments

- Messages

- Profile

Mobile:

Bottom navigation:

- Home

- Discover

- Appointments

- Messages

- Profile

CLINIC NAVIGATION:

- Dashboard

- Appointments

- Calendar

- Doctors

- Patients

- Messages

- Clinic Profile

- Settings

==================================================

PATIENT HOME SCREEN

==================================================

Create a beautiful patient home screen.

Top:

"Good evening, [Patient Name]"

Primary search component:

"What are you looking for?"

Allow natural-language-style input such as:

"Find a pediatrician near Adyar tomorrow evening"

Also support standard search.

Below search, create specialty shortcuts:

- Pediatrics

- Orthopedics

- Dermatology

- General Medicine

- Gynecology

- ENT

- Cardiology

- Dentistry

- Ophthalmology

- Neurology

Include:

"Near you"

Then show several fictional clinics/doctors.

Each doctor card should display:

- Doctor name

- Specialty

- Clinic name

- Area

- Consultation fee

- Languages

- Years of experience

- Rating/review count as demo data

- Next available slot

- Distance

- Book button

Example:

Dr. Ananya Rao

Pediatrician

Little Steps Clinic

Adyar

₹500 consultation

English · Tamil · Hindi

12 years experience

4.8 · 126 reviews

Available today

5:30 PM · 6:00 PM · 7:00 PM

[View Profile] [Book]

Do not overcrowd the card.

==================================================

DOCTOR DISCOVERY

==================================================

Create a powerful doctor search/discovery page.

Users can search by:

- specialty

- doctor name

- clinic

- location

Filters:

- Available today

- Available tomorrow

- Morning

- Afternoon

- Evening

- Consultation fee

- Distance

- Gender

- Language

- Years of experience

Allow sorting by:

- Earliest availability

- Distance

- Consultation fee

Do not create a "Best Doctor" ranking.

Search results should emphasize objective information rather than claiming that one doctor is universally better than another.

Create polished empty states, loading states, and no-results states.

==================================================

CLINIC DISCOVERY

==================================================

Users should also be able to discover clinics.

Clinic cards should contain:

- Clinic name

- Area

- specialties

- doctors

- consultation range

- opening hours

- next available appointment

- services

- address

- phone/contact information where appropriate

Include a map-style visual placeholder for the prototype, but do not require a real maps API yet.

==================================================

DOCTOR PROFILE

==================================================

Create a detailed doctor profile.

Include:

- Profile photo/avatar

- Name

- Specialty

- Qualifications

- Years of experience

- Languages

- Areas of practice

- Clinic

- Consultation fee

- Location

- Clinic hours

- Available appointment slots

- About section

- Services

- Demo reviews

Primary CTA:

"Book Appointment"

Secondary CTA:

"Message Clinic"

Do not provide medical diagnoses or medical treatment recommendations.

==================================================

CLINIC PROFILE

==================================================

Create a clinic profile page.

Include:

- Clinic name

- image/gallery placeholders

- location

- specialties

- doctors

- opening hours

- consultation fees

- services

- available appointments

- facilities

- languages

- contact information

- directions placeholder

Primary CTA:

"Book Appointment"

==================================================

APPOINTMENT BOOKING FLOW

==================================================

Create a polished multi-step booking experience.

Step 1:

Select doctor/service.

Step 2:

Select date.

Step 3:

Select available time slot.

Step 4:

Confirm patient details.

Step 5:

Appointment confirmation.

Show clear information before confirmation:

Doctor

Clinic

Date

Time

Consultation fee

Location

Cancellation/rescheduling policy

After booking, show a polished confirmation screen.

Example:

"Appointment confirmed"

Dr. Ananya Rao

Little Steps Clinic

Tuesday, October 6

5:30 PM

[View Appointment]

[Get Directions]

[Message Clinic]

Use mock appointment data for the prototype.

==================================================

APPOINTMENTS

==================================================

Create an appointments page with:

Upcoming

Past

Cancelled

Appointment cards should clearly display:

- doctor

- clinic

- date

- time

- status

- consultation fee

- location

Actions:

- View details

- Reschedule

- Cancel

- Message clinic

Create appropriate confirmation dialogs for cancellation.

==================================================

MESSAGING

==================================================

Create a modern in-app messaging system.

Important concept:

Patients should communicate with the clinic/doctor without needing to know or expose the doctor's personal phone number.

For the prototype, use fictional conversations.

Conversation list:

- Clinic/doctor name

- last message

- timestamp

- unread indicator

Chat screen:

- message bubbles

- timestamps

- attachment button

- text input

- send button

Show a subtle informational notice:

"Messages are for appointment and clinic communication. This chat is not intended for emergency medical care."

Do NOT expose personal doctor phone numbers.

Include example conversations such as:

Patient:

"Hi, I'd like to confirm whether my appointment tomorrow is still scheduled."

Clinic:

"Yes, your appointment with Dr. Rao is confirmed for 5:30 PM."

==================================================

AI ASSISTANT CONCEPT

==================================================

Include a clearly designed prototype entry point for an AI appointment assistant.

The AI assistant should help with:

- finding doctors

- finding clinics

- filtering availability

- explaining booking options

- scheduling appointments

- rescheduling appointments

- answering basic platform/clinic logistical questions

Example:

Patient:

"I need an orthopedic doctor near Velachery after 6 PM tomorrow."

AI:

"I found 4 orthopedic doctors with evening availability. Here are the closest options..."

Then show doctor cards inside the conversation.

IMPORTANT:

The AI must NOT diagnose medical conditions or provide emergency medical advice.

For this first prototype, the AI can use mock responses and mock data. Do not integrate an actual LLM yet.

==================================================

PATIENT PROFILE

==================================================

Create a patient profile page.

Sections:

- Personal information

- Preferred language

- Saved doctors

- Saved clinics

- Notification preferences

- Privacy settings

- Account settings

Keep the design clean.

==================================================

CLINIC PORTAL

==================================================

Create a separate clinic/admin experience.

CLINIC DASHBOARD:

Show:

Today's appointments

Upcoming appointments

Unread messages

New bookings

Cancellations

Today's estimated revenue

Create a calendar/schedule visualization.

Example:

09:00  Dr. Kumar      Booked

09:30  Dr. Kumar      Booked

10:00  Dr. Kumar      Available

10:30  Dr. Priya      Booked

11:00  Dr. Priya      Available

Use realistic demo data.

==================================================

CLINIC APPOINTMENT MANAGEMENT

==================================================

Clinic staff should be able to:

- view appointments

- confirm appointments

- cancel appointments

- reschedule appointments

- mark patient as arrived

- mark appointment completed

Create useful filters:

- doctor

- date

- status

==================================================

DOCTOR MANAGEMENT

==================================================

Clinic admins can:

- add doctor

- edit doctor

- set specialty

- qualifications

- languages

- consultation fee

- availability

- clinic services

Create an intuitive doctor management interface.

==================================================

SCHEDULE MANAGEMENT

==================================================

Create a schedule editor.

Clinic admin should be able to define:

- working days

- working hours

- appointment duration

- break periods

- unavailable dates

- doctor-specific schedules

Show the schedule visually.

This is prototype functionality using mock data only.

==================================================

CLINIC MESSAGES

==================================================

Clinic staff should have an inbox.

Show:

- patient name

- appointment context

- last message

- unread status

- timestamp

Allow staff to reply.

Clearly distinguish:

- appointment-related communication

- general clinic communication

==================================================

CLINIC PROFILE MANAGEMENT

==================================================

Clinic admins can edit:

- clinic name

- address

- specialties

- services

- opening hours

- consultation fees

- photos

- languages

- description

==================================================

AUTHENTICATION UI

==================================================

Create polished authentication screens:

- Sign up

- Login

- Forgot password

- Email verification placeholder

During signup allow choosing:

"I'm a Patient"

"I'm a Doctor"

"I'm a Clinic"

For the prototype, authentication can be mocked.

Do not implement production authentication yet.

==================================================

DATA MODEL

==================================================

Even though this is initially a prototype with mock data, structure the frontend cleanly around these conceptual entities:

User

Patient

Clinic

Doctor

Specialty

DoctorSchedule

Appointment

Conversation

Message

Review

Notification

Keep the data structures organized so that a real PostgreSQL/Supabase backend can be connected later without rebuilding the UI.

==================================================

MOCK DATA

==================================================

Create a substantial realistic demo dataset.

Include:

- at least 10 fictional doctors

- at least 6 fictional clinics

- multiple specialties

- multiple Chennai neighborhoods

- different consultation fees

- different availability

- several appointments

- several conversations

- different appointment statuses

All providers must be explicitly fictional/demo providers.

==================================================

UX REQUIREMENTS

==================================================

The application should feel like one coherent product.

Prioritize:

- extremely clear navigation

- fast discovery

- minimal clicks to booking

- strong visual hierarchy

- clear CTAs

- excellent mobile responsiveness

- accessible contrast

- meaningful empty states

- useful loading states

- useful error states

- confirmation feedback

- consistent components

Use reusable components rather than duplicating UI.

Avoid:

- excessive animations

- unnecessary gradients

- giant hero sections

- fake statistics

- fake healthcare claims

- clutter

- unnecessary features

- generic dashboard templates

==================================================

TECHNICAL REQUIREMENTS FOR THIS FIRST BUILD

==================================================

This is a FRONTEND-FIRST PRODUCT PROTOTYPE.

Build the application with a clean, maintainable modern frontend architecture.

Use:

- React

- TypeScript

- Tailwind CSS

- reusable components

- clean routing

- organized mock data

- reusable cards/forms/modals

- responsive design

Do NOT add a real database yet.

Do NOT add real payments yet.

Do NOT add real medical records yet.

Do NOT add real prescriptions.

Do NOT add real AI/LLM integration yet.

Do NOT add unnecessary external APIs.

Use mock data and local state where necessary.

However, structure the code so that these can be added later.

==================================================

IMPORTANT DEVELOPMENT PRINCIPLES

==================================================

Do not build a superficial landing page.

Build an actual navigable application prototype where the major user flows can be clicked through.

The most important complete flow is:

Patient:

Home

→ Search

→ Filter

→ Doctor Profile

→ Select Slot

→ Confirm Appointment

→ Appointment Confirmation

→ My Appointments

→ Message Clinic

The second major flow is:

Clinic Login

→ Dashboard

→ Appointments

→ View Appointment

→ Messages

→ Reply to Patient

→ Schedule Management

Make these flows feel complete.

Before finishing, inspect the entire UI for consistency and fix:

- broken navigation

- inconsistent spacing

- inconsistent typography

- missing states

- dead buttons

- overflow on mobile

- poor responsive behavior

- duplicated components

The result should look like a serious startup product prototype that could be demonstrated to users, clinic owners, investors, or developers.

Do not explain what you would build. Actually build the prototype.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/01dbdd62-831a-49f8-98bf-50b9b0dad9c7).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
