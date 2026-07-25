# Runtime Lifecycle

Exit flight and route changes must stop RAF, dispose renderer resources, remove Rapier bodies, cleanup audio/subscriptions. Repeated Hangar ↔ Flight cycles must not grow memory indefinitely.
