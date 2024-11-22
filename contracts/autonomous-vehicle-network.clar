;; Autonomous Vehicle Network

;; Constants
(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u100))
(define-constant err-not-found (err u101))
(define-constant err-unauthorized (err u102))
(define-constant err-already-exists (err u103))
(define-constant err-invalid-state (err u104))

;; Data Maps
(define-map vehicles
  { vehicle-id: uint }
  {
    owner: principal,
    status: (string-ascii 20),
    mileage: uint,
    last-maintenance: uint,
    earnings: uint
  }
)

(define-map rides
  { ride-id: uint }
  {
    passenger: principal,
    vehicle-id: uint,
    start-location: (string-ascii 50),
    end-location: (string-ascii 50),
    distance: uint,
    fare: uint,
    status: (string-ascii 20)
  }
)

(define-map maintenance-schedule
  { vehicle-id: uint }
  { next-maintenance: uint }
)

;; Variables
(define-data-var last-vehicle-id uint u0)
(define-data-var last-ride-id uint u0)

;; Private Functions
(define-private (is-owner)
  (is-eq tx-sender contract-owner)
)

;; Public Functions
(define-public (register-vehicle)
  (let
    (
      (new-vehicle-id (+ (var-get last-vehicle-id) u1))
    )
    (map-set vehicles { vehicle-id: new-vehicle-id }
      {
        owner: tx-sender,
        status: "available",
        mileage: u0,
        last-maintenance: block-height,
        earnings: u0
      }
    )
    (map-set maintenance-schedule { vehicle-id: new-vehicle-id }
      { next-maintenance: (+ block-height u10000) }
    )
    (var-set last-vehicle-id new-vehicle-id)
    (ok new-vehicle-id)
  )
)

(define-public (request-ride (start-location (string-ascii 50)) (end-location (string-ascii 50)) (distance uint))
  (let
    (
      (new-ride-id (+ (var-get last-ride-id) u1))
      (fare (* distance u10)) ;; Simplified fare calculation
      (available-vehicle (get-available-vehicle))
    )
    (asserts! (is-some available-vehicle) err-not-found)
    (let
      (
        (vehicle-id (unwrap-panic available-vehicle))
      )
      (map-set rides { ride-id: new-ride-id }
        {
          passenger: tx-sender,
          vehicle-id: vehicle-id,
          start-location: start-location,
          end-location: end-location,
          distance: distance,
          fare: fare,
          status: "in-progress"
        }
      )
      (map-set vehicles { vehicle-id: vehicle-id }
        (merge (unwrap-panic (map-get? vehicles { vehicle-id: vehicle-id }))
          { status: "occupied" }
        )
      )
      (var-set last-ride-id new-ride-id)
      (ok new-ride-id)
    )
  )
)

(define-private (get-available-vehicle)
  (fold check-vehicle-availability (map-to-list vehicles) none)
)

(define-private (check-vehicle-availability (entry {vehicle-id: uint, vehicle: (tuple (owner principal) (status (string-ascii 20)) (mileage uint) (last-maintenance uint) (earnings uint))}) (result (optional uint)))
  (if (and (is-none result) (is-eq (get status (get vehicle entry)) "available"))
    (some (get vehicle-id entry))
    result
  )
)

(define-public (complete-ride (ride-id uint))
  (let
    (
      (ride (unwrap! (map-get? rides { ride-id: ride-id }) err-not-found))
      (vehicle (unwrap! (map-get? vehicles { vehicle-id: (get vehicle-id ride) }) err-not-found))
    )
    (asserts! (is-eq (get status ride) "in-progress") err-invalid-state)
    (asserts! (is-eq (get owner vehicle) tx-sender) err-unauthorized)
    (map-set rides { ride-id: ride-id }
      (merge ride { status: "completed" })
    )
    (map-set vehicles { vehicle-id: (get vehicle-id ride) }
      (merge vehicle
        {
          status: "available",
          mileage: (+ (get mileage vehicle) (get distance ride)),
          earnings: (+ (get earnings vehicle) (get fare ride))
        }
      )
    )
    (ok true)
  )
)

(define-public (schedule-maintenance (vehicle-id uint))
  (let
    (
      (vehicle (unwrap! (map-get? vehicles { vehicle-id: vehicle-id }) err-not-found))
      (schedule (unwrap! (map-get? maintenance-schedule { vehicle-id: vehicle-id }) err-not-found))
    )
    (asserts! (is-eq (get owner vehicle) tx-sender) err-unauthorized)
    (asserts! (>= block-height (get next-maintenance schedule)) err-invalid-state)
    (map-set vehicles { vehicle-id: vehicle-id }
      (merge vehicle
        {
          status: "maintenance",
          last-maintenance: block-height
        }
      )
    )
    (map-set maintenance-schedule { vehicle-id: vehicle-id }
      { next-maintenance: (+ block-height u10000) }
    )
    (ok true)
  )
)

(define-public (complete-maintenance (vehicle-id uint))
  (let
    (
      (vehicle (unwrap! (map-get? vehicles { vehicle-id: vehicle-id }) err-not-found))
    )
    (asserts! (is-eq (get owner vehicle) tx-sender) err-unauthorized)
    (asserts! (is-eq (get status vehicle) "maintenance") err-invalid-state)
    (map-set vehicles { vehicle-id: vehicle-id }
      (merge vehicle { status: "available" })
    )
    (ok true)
  )
)

(define-public (distribute-earnings (vehicle-id uint))
  (let
    (
      (vehicle (unwrap! (map-get? vehicles { vehicle-id: vehicle-id }) err-not-found))
    )
    (asserts! (is-eq (get owner vehicle) tx-sender) err-unauthorized)
    (let
      (
        (earnings (get earnings vehicle))
        (owner-share (/ (* earnings u80) u100))
        (network-share (- earnings owner-share))
      )
      (try! (as-contract (stx-transfer? owner-share tx-sender (get owner vehicle))))
      (try! (as-contract (stx-transfer? network-share tx-sender contract-owner)))
      (map-set vehicles { vehicle-id: vehicle-id }
        (merge vehicle { earnings: u0 })
      )
      (ok true)
    )
  )
)

;; Read-only functions
(define-read-only (get-vehicle-info (vehicle-id uint))
  (map-get? vehicles { vehicle-id: vehicle-id })
)

(define-read-only (get-ride-info (ride-id uint))
  (map-get? rides { ride-id: ride-id })
)

(define-read-only (get-maintenance-schedule (vehicle-id uint))
  (map-get? maintenance-schedule { vehicle-id: vehicle-id })
)

