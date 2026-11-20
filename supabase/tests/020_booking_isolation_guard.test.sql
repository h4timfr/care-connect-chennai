BEGIN;
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SELECT extensions.plan(2);

SELECT extensions.is(
    pg_catalog.current_setting('transaction_isolation'),
    'repeatable read',
    'fixture really executes at repeatable-read isolation'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-0000000020e1","role":"authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.throws_ok(
    $$ SELECT public.book_appointment(NULL::uuid, NULL::uuid, NULL::date, NULL::time, NULL::text) $$,
    '0A000', 'Booking requires READ COMMITTED transaction isolation.',
    'booking fails closed when row-lock counting cannot use fresh READ COMMITTED snapshots'
);
RESET role;

SELECT * FROM extensions.finish();
ROLLBACK;
