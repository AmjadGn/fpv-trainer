# Aircraft Colliders

Each craft has a versioned `CollisionProfile` compound collider (body / arms / rings / motors / camera as appropriate).

`buildAircraftColliders` replaces the drone rigid body safely inside the existing Rapier world. No propeller-blade colliders.
