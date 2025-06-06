/* routes.js – Medigo API (ES-module) */
import { Router } from "express"
import sql from "mssql"
import { query } from "./db.js"
import bcrypt from "bcrypt";  
import axios from "axios"; // Add axios for HTTP requests

const SALT_ROUNDS = 12;  

const router = Router()

/* turn "", undefined, null, 123  ⇒  null | trimmed string */
const sqlValue = (v) => (v === undefined || v === null || v === "" ? null : String(v).trim())

//admin
 
/* ─────────────── USER MANAGEMENT ROUTES ─────────────── */

/* ───────────────────────────────  CREATE USER  ────────────────────────────── */
router.post("/utilizatori", async (req, res) => {
  const { nume, prenume, rol, username, email, parola, status } = req.body;

  if (!nume || !prenume || !username || !email || !parola) {
    return res
      .status(400)
      .send("nume, prenume, username, email și parola sunt obligatorii");
  }

  try {
    const hash = await bcrypt.hash(parola.trim(), SALT_ROUNDS);

    await query(
      `INSERT INTO dbo.utilizatori
         (nume, prenume, rol, username, email, parola, status)
       VALUES
         (@nume, @prenume, @rol, @username, @email, @parola, @status)`,
      (r) =>
        r
          .input("nume", sql.VarChar(100), nume)
          .input("prenume", sql.VarChar(100), prenume)
          .input("rol", sql.VarChar(50), rol || "Receptionist")
          .input("username", sql.VarChar(50), username)
          .input("email", sql.VarChar(100), email)
          .input("parola", sql.VarChar(255), hash)          // ← store bcrypt
          .input("status", sql.VarChar(20), status || "activ"),
    );

    res.status(201).send("Inserted");
  } catch (e) {
    console.error(e);
    res.status(500).send("DB error");
  }
});


/* ─────────────── ISTORIC TRANSPORTURI ─────────────── */

/* get all transport history */
router.get("/istoric-transporturi", async (_req, res) => {
  try {
    const rows = await query(`
      SELECT ID_transport, ID_medicament, data_ora, status, ID_pacient
        FROM dbo.istoric_transporturi
       ORDER BY data_ora DESC`)
    res.json(rows)
  } catch (e) {
    console.error(e)
    res.status(500).send("DB error")
  }
})


/* ─────────────── HARTA SPITAL ─────────────── */

/* get hospital map */
router.get("/harta-spital", async (_req, res) => {
  try {
    const rows = await query(`
      SELECT nr1, nr2
        FROM dbo.harta_spital`)
    res.json(rows)
  } catch (e) {
    console.error(e)
    res.status(500).send("DB error")
  }
})

/* update hospital map */
router.put("/harta-spital", async (req, res) => {
  const { nr1, nr2 } = req.body

  if (!nr1 || !nr2) {
    return res.status(400).send("nr1 și nr2 sunt obligatorii")
  }

  // Validate that nr1 and nr2 are 128-character binary strings
  if (nr1.length !== 128 || nr2.length !== 128) {
    return res.status(400).send("nr1 și nr2 trebuie să aibă exact 128 de caractere")
  }

  if (!/^[01]+$/.test(nr1) || !/^[01]+$/.test(nr2)) {
    return res.status(400).send("nr1 și nr2 trebuie să conțină doar 0 și 1")
  }

  try {
    // Check if record exists
    const existingRows = await query(`SELECT COUNT(*) as count FROM dbo.harta_spital`)
    
    if (existingRows[0].count > 0) {
      // Update existing record
      await query(
        `UPDATE dbo.harta_spital SET nr1 = @nr1, nr2 = @nr2`,
        (r) => r
          .input("nr1", sql.VarChar(128), nr1)
          .input("nr2", sql.VarChar(128), nr2)
      )
    } else {
      // Insert new record
      await query(
        `INSERT INTO dbo.harta_spital (nr1, nr2) VALUES (@nr1, @nr2)`,
        (r) => r
          .input("nr1", sql.VarChar(128), nr1)
          .input("nr2", sql.VarChar(128), nr2)
      )
    }

    res.sendStatus(204)
  } catch (e) {
    console.error(e)
    res.status(500).send("DB error")
  }
})

/* get transport history by ID */
router.get("/istoric-transporturi/:id", async (req, res) => {
  const id = +req.params.id
  try {
    const rows = await query(
      `SELECT ID_transport, ID_medicament, data_ora, status, ID_pacient
         FROM dbo.istoric_transporturi
        WHERE ID_transport = @id`,
      (r) => r.input("id", sql.Int, id),
    )
    if (!rows.length) return res.status(404).send("Not found")
    res.json(rows[0])
  } catch (e) {
    console.error(e)
    res.status(500).send("DB error")
  }
})

/* ───────────────────────────────  UPDATE USER  ────────────────────────────── */
router.put("/utilizatori/:id", async (req, res) => {
  const id = +req.params.id;
  const { nume, prenume, rol, username, email, parola, status } = req.body;

  if (!nume || !prenume || !username || !email) {
    return res
      .status(400)
      .send("nume, prenume, username și email sunt obligatorii");
  }

  try {
    // Decide SQL based on whether a new password was supplied
    if (parola) {
      const hash = await bcrypt.hash(parola.trim(), SALT_ROUNDS);

      await query(
        `UPDATE dbo.utilizatori
            SET nume     = @nume,
                prenume  = @prenume,
                rol      = @rol,
                username = @username,
                email    = @email,
                parola   = @parola,
                status   = @status
          WHERE ID_utilizator = @id`,
        (r) =>
          r
            .input("id", sql.Int, id)
            .input("nume", sql.VarChar(100), nume)
            .input("prenume", sql.VarChar(100), prenume)
            .input("rol", sql.VarChar(50), rol)
            .input("username", sql.VarChar(50), username)
            .input("email", sql.VarChar(100), email)
            .input("parola", sql.VarChar(255), hash)       // ← new bcrypt
            .input("status", sql.VarChar(20), status),
      );
    } else {
      await query(
        `UPDATE dbo.utilizatori
            SET nume     = @nume,
                prenume  = @prenume,
                rol      = @rol,
                username = @username,
                email    = @email,
                status   = @status
          WHERE ID_utilizator = @id`,
        (r) =>
          r
            .input("id", sql.Int, id)
            .input("nume", sql.VarChar(100), nume)
            .input("prenume", sql.VarChar(100), prenume)
            .input("rol", sql.VarChar(50), rol)
            .input("username", sql.VarChar(50), username)
            .input("email", sql.VarChar(100), email)
            .input("status", sql.VarChar(20), status),
      );
    }

    res.sendStatus(204);
  } catch (e) {
    console.error(e);
    res.status(500).send("DB error");
  }
});


/* delete user */
router.delete("/utilizatori/:id", async (req, res) => {
  const id = +req.params.id

  try {
    // Check if user exists
    const userCheck = await query(
      `SELECT COUNT(*) as count
         FROM dbo.utilizatori
        WHERE ID_utilizator = @id`,
      (r) => r.input("id", sql.Int, id),
    )

    if (userCheck[0].count === 0) {
      return res.status(404).send("User not found")
    }

    // Delete user
    await query(`DELETE FROM dbo.utilizatori WHERE ID_utilizator = @id`, (r) => r.input("id", sql.Int, id))

    res.sendStatus(204)
  } catch (e) {
    console.error(e)
    res.status(500).send("DB error")
  }
})


// alarme

router.get("/alarme", async (req, res) => {
  try {
const rows = await query(`SELECT * from dbo.alarme`)
    res.json(rows)
  } catch (error) {
    console.error("Error fetching alarme:", error);
    res.status(500).send("Error fetching alarme data");
  }
});

/* ─────────────── PACIENȚI ─────────────── */

/* all patients */
router.get("/patients", async (_req, res) => {
  try {
    const rows = await query(`
      SELECT ID_pacient AS id, nume, prenume, CNP,
             adresa, telefon, salon, pat
        FROM dbo.pacienti`)
    res.json(rows)
  } catch (e) {
    console.error(e)
    res.status(500).send("DB error")
  }
})

/* one patient */
router.get("/patients/:id", async (req, res) => {
  const id = +req.params.id
  try {
    const rows = await query(
      `SELECT ID_pacient AS id, nume, prenume, CNP,
              adresa, telefon, salon, pat
         FROM dbo.pacienti
        WHERE ID_pacient = @id`,
      (r) => r.input("id", sql.Int, id),
    )
    if (!rows.length) return res.status(404).send("Not found")
    res.json(rows[0])
  } catch (e) {
    console.error(e)
    res.status(500).send("DB error")
  }
})

/* create */
router.post("/patients", async (req, res) => {
  const { nume, prenume, CNP } = req.body
  if (!nume || !prenume || !CNP) return res.status(400).send("nume, prenume și CNP sunt obligatorii")

  try {
    await query(
      `INSERT INTO dbo.pacienti
         (nume, prenume, CNP, adresa, telefon, salon, pat)
       VALUES
         (@nume,@prenume,@CNP,@adresa,@telefon,@salon,@pat)`,
      (r) =>
        r
          .input("nume", sql.VarChar(100), nume)
          .input("prenume", sql.VarChar(100), prenume)
          .input("CNP", sql.Char(13), CNP)
          .input("adresa", sql.VarChar(255), sqlValue(req.body.adresa))
          .input("telefon", sql.VarChar(20), sqlValue(req.body.telefon))
          .input("salon", sql.VarChar(10), sqlValue(req.body.salon))
          .input("pat", sql.VarChar(10), sqlValue(req.body.pat)),
    )
    res.status(201).send("Inserted")
  } catch (e) {
    console.error(e)
    res.status(500).send("DB error")
  }
})

/* update */
router.put("/patients/:id", async (req, res) => {
  const id = +req.params.id
  const { nume, prenume, CNP } = req.body
  if (!nume || !prenume || !CNP) return res.status(400).send("nume, prenume și CNP sunt obligatorii")

  try {
    await query(
      `UPDATE dbo.pacienti
          SET nume    = @nume,
              prenume = @prenume,
              CNP     = @CNP,
              adresa  = @adresa,
              telefon = @telefon,
              salon   = @salon,
              pat     = @pat
        WHERE ID_pacient = @id`,
      (r) =>
        r
          .input("id", sql.Int, id)
          .input("nume", sql.VarChar(100), nume)
          .input("prenume", sql.VarChar(100), prenume)
          .input("CNP", sql.Char(13), CNP)
          .input("adresa", sql.VarChar(255), sqlValue(req.body.adresa))
          .input("telefon", sql.VarChar(20), sqlValue(req.body.telefon))
          .input("salon", sql.VarChar(10), sqlValue(req.body.salon))
          .input("pat", sql.VarChar(10), sqlValue(req.body.pat)),
    )
    res.sendStatus(204)
  } catch (e) {
    console.error(e)
    res.status(500).send("DB error")
  }
})

/* delete – manual cascade chain */
router.delete("/patients/:id", async (req, res) => {
  const id = +req.params.id

  try {
    /* 1 ▸ delete comenzi_robot rows (depend on prescription) */
    await query(
      `DELETE cr
         FROM dbo.comenzi_robot cr
         JOIN dbo.prescriptii p ON p.ID_prescriptie = cr.ID_prescriptie
        WHERE p.ID_pacient = @id`,
      (r) => r.input("id", sql.Int, id),
    )

    /* 2 ▸ delete prescriptii_medicamente */
    await query(
      `DELETE pm
         FROM dbo.prescriptii_medicamente pm
         JOIN dbo.prescriptii p ON p.ID_prescriptie = pm.ID_prescriptie
        WHERE p.ID_pacient = @id`,
      (r) => r.input("id", sql.Int, id),
    )

    /* 3 ▸ delete prescriptii */
    await query(`DELETE FROM dbo.prescriptii WHERE ID_pacient = @id`, (r) => r.input("id", sql.Int, id))

    /* 4 ▸ delete patient */
    await query(`DELETE FROM dbo.pacienti WHERE ID_pacient = @id`, (r) => r.input("id", sql.Int, id))

    res.sendStatus(204)
  } catch (e) {
    console.error(e)
    res.status(500).send("DB error")
  }
})

/* ─────────────── MEDICAMENTE ─────────────── */

/* all medications - matches your React component's API call */
router.get("/medicamente", async (_req, res) => {
  try {
    const rows = await query(`
      SELECT ID_medicament, denumire, descriere, RFID, stoc_curent
        FROM dbo.medicamente
       ORDER BY denumire`)
    res.json(rows)
  } catch (e) {
    console.error(e)
    res.status(500).send("DB error")
  }
})

/* alternative endpoint with English name */
router.get("/medications", async (_req, res) => {
  try {
    const rows = await query(`
      SELECT ID_medicament, denumire, descriere, RFID, stoc_curent
        FROM dbo.medicamente
       ORDER BY denumire`)
    res.json(rows)
  } catch (e) {
    console.error(e)
    res.status(500).send("DB error")
  }
})

/* one medication */
router.get("/medications/:id", async (req, res) => {
  const id = +req.params.id
  try {
    const rows = await query(
      `SELECT ID_medicament, denumire, descriere, RFID, stoc_curent
         FROM dbo.medicamente
        WHERE ID_medicament = @id`,
      (r) => r.input("id", sql.Int, id),
    )
    if (!rows.length) return res.status(404).send("Not found")
    res.json(rows[0])
  } catch (e) {
    console.error(e)
    res.status(500).send("DB error")
  }
})

/* create medication */
router.post("/medications", async (req, res) => {
  const { denumire, stoc_curent } = req.body
  if (!denumire || stoc_curent === undefined) return res.status(400).send("denumire și stoc_curent sunt obligatorii")

  try {
    await query(
      `INSERT INTO dbo.medicamente
         (denumire, descriere, RFID, stoc_curent)
       VALUES
         (@denumire, @descriere, @RFID, @stoc_curent)`,
      (r) =>
        r
          .input("denumire", sql.VarChar(255), denumire)
          .input("descriere", sql.VarChar(500), sqlValue(req.body.descriere))
          .input("RFID", sql.VarChar(50), sqlValue(req.body.RFID))
          .input("stoc_curent", sql.Int, +stoc_curent),
    )
    res.status(201).send("Inserted")
  } catch (e) {
    console.error(e)
    res.status(500).send("DB error")
  }
})

/* update medication */
router.put("/medications/:id", async (req, res) => {
  const id = +req.params.id
  const { denumire, stoc_curent } = req.body
  if (!denumire || stoc_curent === undefined) return res.status(400).send("denumire și stoc_curent sunt obligatorii")

  try {
    await query(
      `UPDATE dbo.medicamente
          SET denumire    = @denumire,
              descriere   = @descriere,
              RFID        = @RFID,
              stoc_curent = @stoc_curent
        WHERE ID_medicament = @id`,
      (r) =>
        r
          .input("id", sql.Int, id)
          .input("denumire", sql.VarChar(255), denumire)
          .input("descriere", sql.VarChar(500), sqlValue(req.body.descriere))
          .input("RFID", sql.VarChar(50), sqlValue(req.body.RFID))
          .input("stoc_curent", sql.Int, +stoc_curent),
    )
    res.sendStatus(204)
  } catch (e) {
    console.error(e)
    res.status(500).send("DB error")
  }
})

/* delete medication – with cascade check */
router.delete("/medications/:id", async (req, res) => {
  const id = +req.params.id

  try {
    /* Check if medication is used in any prescriptions */
    const prescriptionCheck = await query(
      `SELECT COUNT(*) as count
         FROM dbo.prescriptii_medicamente
        WHERE ID_medicament = @id`,
      (r) => r.input("id", sql.Int, id),
    )

    if (prescriptionCheck[0].count > 0) {
      return res.status(400).send("Nu se poate șterge medicamentul - este folosit în prescripții")
    }

    /* Delete medication */
    await query(`DELETE FROM dbo.medicamente WHERE ID_medicament = @id`, (r) => r.input("id", sql.Int, id))

    res.sendStatus(204)
  } catch (e) {
    console.error(e)
    res.status(500).send("DB error")
  }
})

/* ─────────────── PRESCRIPȚII ─────────────── */

/* get all prescriptions */
router.get("/prescriptions", async (_req, res) => {
  try {
    const rows = await query(`
      SELECT p.ID_prescriptie,
             p.ID_pacient,
             p.ID_medic,
             p.data_prescriptiei,
             pac.nume + ' ' + pac.prenume AS patient_name,
             u.nume + ' ' + u.prenume AS doctor_name
        FROM dbo.prescriptii p
        JOIN dbo.pacienti pac ON pac.ID_pacient = p.ID_pacient
        JOIN dbo.utilizatori u ON u.ID_utilizator = p.ID_medic
       ORDER BY p.data_prescriptiei DESC`)
    res.json(rows)
  } catch (e) {
    console.error(e)
    res.status(500).send("DB error")
  }
})

/* get prescription medications */
router.get("/prescriptions/:id/medications", async (req, res) => {
  const id = +req.params.id
  try {
    const rows = await query(
      `SELECT pm.ID_prescriptie,
              pm.ID_medicament,
              pm.doza,
              pm.frecventa,
              m.denumire AS medication_name,
              m.stoc_curent
         FROM dbo.prescriptii_medicamente pm
         JOIN dbo.medicamente m ON m.ID_medicament = pm.ID_medicament
        WHERE pm.ID_prescriptie = @id`,
      (r) => r.input("id", sql.Int, id),
    )
    res.json(rows)
  } catch (e) {
    console.error(e)
    res.status(500).send("DB error")
  }
})

/* create prescription with stock calculation - using existing query function */
router.post("/prescriptions", async (req, res) => {
  const { ID_pacient, ID_medic, medications } = req.body

  if (!ID_pacient || !ID_medic || !medications || !medications.length) {
    return res.status(400).send("ID_pacient, ID_medic și medications sunt obligatorii")
  }

  // Validate medications
  for (const med of medications) {
    if (!med.ID_medicament || med.doza < 100 || med.doza > 1000 || med.frecventa < 1 || med.frecventa > 30) {
      return res.status(400).send("Datele medicamentelor sunt invalide")
    }
    // Insert into istoric_transporturi only for the first medication
    if (medications.indexOf(med) === 0) {
      await query(
        `INSERT INTO dbo.istoric_transporturi
          (ID_medicament, data_ora, status, ID_pacient)
        VALUES
          (@ID_medicament, SYSDATETIME(), @status, @ID_pacient)`,
        (r) =>
          r
            .input("ID_medicament", sql.Int, med.ID_medicament)
            .input("status", sql.VarChar(50), "in curs")
            .input("ID_pacient", sql.Int, ID_pacient)
      )
    }
  }

  try {
    // Debug info
    console.log(
      "Creating prescription with data:",
      JSON.stringify(
        {
          ID_pacient,
          ID_medic,
          medications,
        },
        null,
        2,
      ),
    )

    // 1. Create prescription and get the ID
    const prescriptionResult = await query(
      `INSERT INTO dbo.prescriptii (ID_pacient, ID_medic, data_prescriptiei)
       OUTPUT INSERTED.ID_prescriptie
       VALUES (@ID_pacient, @ID_medic, SYSDATETIME())`,
      (r) => r.input("ID_pacient", sql.Int, ID_pacient).input("ID_medic", sql.Int, ID_medic),
    )
    

    if (!prescriptionResult || prescriptionResult.length === 0) {
      console.error("Failed to get prescription ID from insert")
      return res.status(500).send("Failed to create prescription")
    }

    const prescriptionId = prescriptionResult[0].ID_prescriptie
    console.log(`Created prescription ID: ${prescriptionId}`)

    // Get patient data for robot command
    const patientData = await query(
      `SELECT salon, pat FROM dbo.pacienti WHERE ID_pacient = @ID_pacient`,
      (r) => r.input("ID_pacient", sql.Int, ID_pacient),
    )

    if (!patientData.length) {
      console.error(`Patient with ID ${ID_pacient} not found`)
      return res.status(404).send(`Pacientul cu ID ${ID_pacient} nu există`)
    }

    const patient = patientData[0]

    // 2. Process each medication
    for (const med of medications) {
      console.log(`Processing medication ID: ${med.ID_medicament}`)

      // Calculate total dosage in mg
      const totalDosageMg = med.doza * med.frecventa

      // Convert to grams and calculate stock reduction
      const totalDosageGrams = totalDosageMg / 1000

      // For every 5g, subtract 1 from stock (always round up)
      const stockReduction = Math.ceil(totalDosageGrams / 5)
      console.log(`Calculated stock reduction: ${stockReduction} for dosage: ${totalDosageMg}mg`)

      // Check if enough stock is available
      const stockCheck = await query(
        `SELECT stoc_curent, RFID FROM dbo.medicamente WHERE ID_medicament = @ID_medicament`,
        (r) => r.input("ID_medicament", sql.Int, med.ID_medicament),
      )

      if (!stockCheck.length) {
        console.error(`Medication with ID ${med.ID_medicament} not found`)
        return res.status(404).send(`Medicamentul cu ID ${med.ID_medicament} nu există`)
      }

      const currentStock = stockCheck[0].stoc_curent
      const medicationRFID = stockCheck[0].RFID
      console.log(`Current stock for medication ${med.ID_medicament}: ${currentStock}`)

      if (currentStock < stockReduction) {
        console.error(`Insufficient stock for medication ${med.ID_medicament}: ${currentStock} < ${stockReduction}`)
        return res
          .status(400)
          .send(
            `Stoc insuficient pentru medicamentul cu ID ${med.ID_medicament}. Disponibil: ${currentStock}, Necesar: ${stockReduction}`,
          )
      }

      // Insert prescription medication
      console.log(
        `Inserting prescription_medication: ID_prescriptie=${prescriptionId}, ID_medicament=${med.ID_medicament}`,
      )
      await query(
        `INSERT INTO dbo.prescriptii_medicamente 
         (ID_prescriptie, ID_medicament, doza, frecventa)
         VALUES (@ID_prescriptie, @ID_medicament, @doza, @frecventa)`,
        (r) =>
          r
            .input("ID_prescriptie", sql.Int, prescriptionId)
            .input("ID_medicament", sql.Int, med.ID_medicament)
            .input("doza", sql.VarChar(50), `${med.doza}mg`)
            .input("frecventa", sql.VarChar(50), `${med.frecventa} zile`),
      )

      // Update medication stock
      console.log(`Updating stock for medication ${med.ID_medicament}: ${currentStock} - ${stockReduction}`)
      await query(
        `UPDATE dbo.medicamente 
         SET stoc_curent = stoc_curent - @stockReduction
         WHERE ID_medicament = @ID_medicament`,
        (r) => r.input("ID_medicament", sql.Int, med.ID_medicament).input("stockReduction", sql.Int, stockReduction),
      )

      // Send HTTP POST to robot for each medication
      try {
        const robotCommand = {
          salon: String(patient.salon ?? "1"),
          pat: String(patient.pat ?? "1"),
          rfid: String(medicationRFID ?? "rfid"),
        }

        console.log(`Sending robot command for medication ${med.ID_medicament}:`, robotCommand)
        
        const robotResponse = await axios.post(`http://10.100.0.48/comanda`, robotCommand, { // ip_robot
          timeout: 5000, // 5 second timeout
          headers: {
            'Content-Type': 'application/json'
          }
        })

        console.log(`Robot command sent successfully for medication ${med.ID_medicament}:`, robotResponse.status)
      } catch (robotError) {
        console.error(`Failed to send robot command for medication ${med.ID_medicament}:`, robotError.message)
        // Continue with prescription creation even if robot command fails
        // You might want to log this error or handle it differently based on your requirements
      }
    }

    console.log(`Prescription ${prescriptionId} created successfully`)
    res.status(201).json({ ID_prescriptie: prescriptionId })
  } catch (e) {
    console.error("Error creating prescription:", e)
    res.status(500).send(e.message || "DB error")
  }
})

/* update prescription with stock recalculation */
router.put("/prescriptions/:id", async (req, res) => {
  const prescriptionId = +req.params.id
  const { medications } = req.body

  if (!medications || !medications.length) {
    return res.status(400).send("medications sunt obligatorii")
  }

  // Validate medications
  for (const med of medications) {
    if (!med.ID_medicament || med.doza < 100 || med.doza > 1000 || med.frecventa < 1 || med.frecventa > 30) {
      return res.status(400).send("Datele medicamentelor sunt invalide")
    }
  }

  try {
    console.log(`Updating prescription ${prescriptionId} with data:`, JSON.stringify(medications, null, 2))

    // 1. Get current prescription medications
    const currentMedications = await query(
      `SELECT pm.ID_medicament, pm.doza, pm.frecventa
       FROM dbo.prescriptii_medicamente pm
       WHERE pm.ID_prescriptie = @prescriptionId`,
      (r) => r.input("prescriptionId", sql.Int, prescriptionId),
    )

    console.log("Current medications:", currentMedications)

    // 2. Calculate stock adjustments for each medication
    for (const newMed of medications) {
      const currentMed = currentMedications.find((cm) => cm.ID_medicament === newMed.ID_medicament)

      if (currentMed) {
        // Parse current values (remove "mg" and "zile" suffixes)
        const currentDoza = Number.parseInt(currentMed.doza.replace("mg", ""))
        const currentFrecventa = Number.parseInt(currentMed.frecventa.replace(" zile", ""))

        // Calculate old and new total dosages
        const oldTotalDosageMg = currentDoza * currentFrecventa
        const newTotalDosageMg = newMed.doza * newMed.frecventa

        // Calculate old and new stock usage
        const oldStockUsage = Math.ceil(oldTotalDosageMg / 1000 / 5)
        const newStockUsage = Math.ceil(newTotalDosageMg / 1000 / 5)

        // Calculate stock difference (positive = need more stock, negative = return stock)
        const stockDifference = newStockUsage - oldStockUsage

        console.log(
          `Medication ${newMed.ID_medicament}: old=${oldTotalDosageMg}mg (${oldStockUsage} stock), new=${newTotalDosageMg}mg (${newStockUsage} stock), difference=${stockDifference}`,
        )

        if (stockDifference > 0) {
          // Need more stock - check availability
          const stockCheck = await query(
            `SELECT stoc_curent FROM dbo.medicamente WHERE ID_medicament = @ID_medicament`,
            (r) => r.input("ID_medicament", sql.Int, newMed.ID_medicament),
          )

          if (!stockCheck.length) {
            return res.status(404).send(`Medicamentul cu ID ${newMed.ID_medicament} nu există`)
          }

          const currentStock = stockCheck[0].stoc_curent
          if (currentStock < stockDifference) {
            return res
              .status(400)
              .send(
                `Stoc insuficient pentru medicamentul cu ID ${newMed.ID_medicament}. Disponibil: ${currentStock}, Necesar suplimentar: ${stockDifference}`,
              )
          }
        }

        // Update stock (subtract if positive difference, add if negative)
        if (stockDifference !== 0) {
          console.log(
            `Updating stock for medication ${newMed.ID_medicament}: ${stockDifference > 0 ? "subtracting" : "adding"} ${Math.abs(stockDifference)}`,
          )
          await query(
            `UPDATE dbo.medicamente 
             SET stoc_curent = stoc_curent - @stockDifference
             WHERE ID_medicament = @ID_medicament`,
            (r) =>
              r
                .input("ID_medicament", sql.Int, newMed.ID_medicament)
                .input("stockDifference", sql.Int, stockDifference),
          )
        }

        // Update prescription medication
        await query(
          `UPDATE dbo.prescriptii_medicamente 
           SET doza = @doza, frecventa = @frecventa
           WHERE ID_prescriptie = @prescriptionId AND ID_medicament = @ID_medicament`,
          (r) =>
            r
              .input("prescriptionId", sql.Int, prescriptionId)
              .input("ID_medicament", sql.Int, newMed.ID_medicament)
              .input("doza", sql.VarChar(50), `${newMed.doza}mg`)
              .input("frecventa", sql.VarChar(50), `${newMed.frecventa} zile`),
        )
      }
    }

    console.log(`Prescription ${prescriptionId} updated successfully`)
    res.status(200).json({ success: true })
  } catch (e) {
    console.error("Error updating prescription:", e)
    res.status(500).send(e.message || "DB error")
  }
})

router.get("/patients/:id/prescriptions", async (req, res) => {
  const id = +req.params.id
  try {
    const rows = await query(
      `SELECT p.ID_prescriptie          AS prescriptionId,
              p.data_prescriptiei       AS issuedAt,
              u.nume + ' ' + u.prenume  AS doctor,
              m.ID_medicament           AS medId,
              m.denumire                AS medName,
              pm.doza,
              pm.frecventa
         FROM dbo.prescriptii             p
         JOIN dbo.utilizatori             u  ON u.ID_utilizator   = p.ID_medic
         JOIN dbo.prescriptii_medicamente pm ON pm.ID_prescriptie = p.ID_prescriptie
         JOIN dbo.medicamente             m  ON m.ID_medicament   = pm.ID_medicament
        WHERE p.ID_pacient = @id
        ORDER BY p.data_prescriptiei DESC`,
      (r) => r.input("id", sql.Int, id),
    )
    res.json(rows)
  } catch (e) {
    console.error(e)
    res.status(500).send("DB error")
  }
})

/* ─────────────── UTILIZATORI & LOGIN (unchanged) ─────────────── */

router.get("/utilizatori", async (_req, res) => {
  try {
    const rows = await query(`
      SELECT ID_utilizator AS id, nume, prenume, rol,
             username, email, parola, status
        FROM dbo.utilizatori`)
    res.json(rows)
  } catch (e) {
    console.error(e)
    res.status(500).send("DB error")
  }
})

router.get("/utilizatori/:id", async (req, res) => {
  const id = +req.params.id
  try {
    const rows = await query(
      `SELECT ID_utilizator AS id, nume, prenume, rol,
              username, email, parola, status
         FROM dbo.utilizatori
        WHERE ID_utilizator = @id`,
      (r) => r.input("id", sql.Int, id),
    )
    if (!rows.length) return res.status(404).send("Not found")
    res.json(rows[0])
  } catch (e) {
    console.error(e)
    res.status(500).send("DB error")
  }
})

router.post("/login", async (req, res) => {
  const { email: userRaw, password } = req.body;
  if (!userRaw || !password) return res.status(400).send("Missing fields");

  try {
    // 🔸  Look user up by email OR username – no password in the WHERE clause
    const rows = await query(
      `SELECT ID_utilizator        AS id,
              LOWER(email)         AS email,
              nume, prenume, rol,
              parola               -- bcrypt hash
         FROM dbo.utilizatori
        WHERE LOWER(email)    = @u
           OR LOWER(username) = @u`,
      (r) => r.input("u", sql.VarChar(255), userRaw.trim().toLowerCase()),
    );

    if (!rows.length) return res.status(401).send("Invalid credentials");

    const user = rows[0];

    // 🔸  Compare candidate password with stored bcrypt hash
    const ok = await bcrypt.compare(password.trim(), user.parola);
    if (!ok) return res.status(401).send("Invalid credentials");

    delete user.parola;            // never leak the hash
    res.json({ user });
  } catch (e) {
    console.error(e);
    res.status(500).send("DB error");
  }
});
/**
 * Primită de robot când o comandă dă eroare.
 * Body JSON: { idComanda: 123, descriere?: "mesaj opţional" }
 */
router.post("/robot/error", async (req, res) => {
  // 1) Citim doar descrierea, nu mai căutăm idComanda
  const descriere = sqlValue(req.body.descriere)

  try {
    // 2) Inserăm în tabela 'alarme' cu ID_comanda = 1, indiferent ce trimite clientul
    await query(
      `
      INSERT INTO dbo.alarme
             (tip_alarma, descriere, data_ora, status, ID_comanda)
      VALUES
             ('EROARE_ROBOT', @descriere, SYSDATETIME(), 'noua', 1)
      `,
      (r) => r.input("descriere", sql.VarChar(255), descriere ?? "Eroare standard robot"),
    )

    return res.status(201).send("Alarmă înregistrată")
  } catch (e) {
    console.error(">>> [POST /robot/error] DB error:", e)
    return res.status(500).send("DB error")
  }
})


router.post("/update-status", async (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).send("Câmpul 'status' este obligatoriu");

  try {
    // Găsește ultimul transport introdus (cel mai mare ID_transport)
    const rows = await query(
      'SELECT TOP 1 ID_transport FROM dbo.istoric_transporturi ORDER BY ID_transport DESC'
    );
    if (!rows.length) return res.status(404).send("Nu există transporturi");

    const lastId = rows[0].ID_transport;

    // Actualizează statusul
    await query(
      'UPDATE dbo.istoric_transporturi SET status = @status WHERE ID_transport = @id',
      (r) => r.input("status", sql.VarChar(50), status).input("id", sql.Int, lastId)
    );

    res.status(200).send("Status actualizat");
  } catch (e) {
    console.error(e);
    res.status(500).send("DB error");
  }
});

export default router