# Product Architecture (Alpha)

FPV Trainer is a browser-based FPV simulator organized around a single application shell, simulator runtime, physics loop, renderer lifecycle, controller service, audio engine, replay system, settings system, authentication system, analytics abstraction, and error-reporting abstraction.

Primary user paths: **Learn**, **Fly**, **Compete**.

Product entry: public landing (`/`) → product shell (`/app`) with guest-first access.
