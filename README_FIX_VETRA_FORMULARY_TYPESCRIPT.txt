VETRA Formulary TypeScript fix

Place this installer and the v4 component beside your project root:
- BSAVAFormularyPicker_v4_clinic_concentration.tsx
- FIX_VETRA_FORMULARY_TYPESCRIPT.ps1

Run:
powershell -ExecutionPolicy Bypass -File .\FIX_VETRA_FORMULARY_TYPESCRIPT.ps1
npm run build

The installer copies the v4 component into components/ and removes the
temporary root-level v4 source file so TypeScript doesn't type-check it twice.
