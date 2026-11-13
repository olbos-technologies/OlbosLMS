-- PostgreSQL must commit a new enum value before a later migration can use it.
ALTER TYPE "EntitlementKey" ADD VALUE 'CAMPUS_MODULE';
