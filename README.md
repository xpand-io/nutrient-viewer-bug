# Setup

* `yarn install`
* `npx http-server`
* Open `http://localhost:8080`

# Details

* Resizes the viewer div to be A4 size (#viewer width * Math.SQRT2)
* Instantiates NutrientView (headless)
* Looks for "[[signature]]" text in document
* Calculates the redactions and signature fields needed
* Applys the redactions
* Applys the signature fields
* Exports the PDF with redactions and signature fields
* Unloads the NurtrientViewer
* Instantiates the NutrientViewer
