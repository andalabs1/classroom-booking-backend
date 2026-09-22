# Database Entity Relationship Diagram

แผนภาพนี้อ้างอิงจาก `prisma/schema.prisma` และ migration ปัจจุบันของฐานข้อมูล MySQL

ไฟล์สำหรับแก้ไขใน diagrams.net: [`db-erd.drawio`](./db-erd.drawio)

```mermaid
classDiagram
    direction LR

    class USER {
        id : type [PK]
        userCode : VARCHAR [UK, nullable, max 50]
        name : VARCHAR [max 150]
        firstName : VARCHAR [nullable, max 100]
        lastName : VARCHAR [nullable, max 100]
        phone : VARCHAR [nullable, max 20]
        email : VARCHAR [UK, max 255]
        passwordHash : VARCHAR [max 255]
        role : ENUM USER-STUDENT-TEACHER-ADMIN
        status : ENUM ACTIVE-INACTIVE-SUSPENDED
        tokenVersion : INT [default 0]
        createdAt : DATETIME
        updatedAt : DATETIME
    }

    class CLASSROOM {
        id : type [PK]
        code : VARCHAR [UK, nullable, max 50]
        name : VARCHAR [max 100]
        building : VARCHAR [max 100]
        floor : VARCHAR [max 50]
        capacity : INT
        description : TEXT [nullable]
        category : VARCHAR [nullable, max 100]
        equipment : JSON [nullable]
        imageUrl : VARCHAR [nullable, max 500]
        status : ENUM ACTIVE-INACTIVE-MAINTENANCE
        createdAt : DATETIME
        updatedAt : DATETIME
    }

    class BOOKING {
        id : type [PK]
        bookingCode : VARCHAR [UK, max 30]
        userId : type [FK]
        classroomId : type [FK]
        purpose : VARCHAR [max 255]
        attendeeCount : INT [default 1]
        requestedEquipment : JSON [nullable]
        description : TEXT [nullable]
        startAt : DATETIME
        endAt : DATETIME
        status : ENUM PENDING-CONFIRMED-IN_USE-REJECTED-CANCELLED-COMPLETED-NO_SHOW
        adminNote : TEXT [nullable]
        approvedBy : type [FK, nullable]
        approvedAt : DATETIME [nullable]
        checkedInAt : DATETIME [nullable]
        completedAt : DATETIME [nullable]
        cancelledAt : DATETIME [nullable]
        cancelReason : TEXT [nullable]
        createdAt : DATETIME
        updatedAt : DATETIME
    }

    class NOTIFICATION {
        id : type [PK]
        userId : type [FK]
        bookingId : type [FK, nullable]
        title : VARCHAR
        message : TEXT
        type : VARCHAR
        dedupeKey : VARCHAR [UK, nullable, max 191]
        isRead : BOOLEAN [default false]
        readAt : DATETIME [nullable]
        createdAt : DATETIME
    }

    class AUDIT_LOG {
        id : type [PK]
        userId : type [FK, nullable]
        action : VARCHAR
        entity : VARCHAR
        entityId : type [nullable, logical reference]
        oldValue : JSON [nullable]
        newValue : JSON [nullable]
        createdAt : DATETIME
    }

    USER "1" --> "0..*" BOOKING : creates
    USER "0..1" --> "0..*" BOOKING : approves
    CLASSROOM "1" --> "0..*" BOOKING : is reserved by
    USER "1" --> "0..*" NOTIFICATION : receives
    BOOKING "0..1" --> "0..*" NOTIFICATION : generates
    USER "0..1" --> "0..*" AUDIT_LOG : performs
```

## Foreign keys

- `Booking.userId` → `User.id` (`ON DELETE RESTRICT`)
- `Booking.classroomId` → `Classroom.id` (`ON DELETE RESTRICT`)
- `Booking.approvedBy` → `User.id` (`ON DELETE SET NULL`)
- `Notification.userId` → `User.id` (`ON DELETE CASCADE`)
- `Notification.bookingId` → `Booking.id` (`ON DELETE SET NULL`)
- `AuditLog.userId` → `User.id` (`ON DELETE SET NULL`)

`AuditLog.entityId` เป็น polymorphic/logical reference ที่ใช้ร่วมกับ `entity` จึงไม่ได้ประกาศเป็น foreign key โดยตรง

## Main indexes

- `Booking`: `userId`, `classroomId`, `status`, `startAt`, `endAt`
- `Booking`: composite index (`classroomId`, `startAt`, `endAt`, `status`)
- `Notification`: `userId`, `bookingId`, `isRead`
- `AuditLog`: `userId`
