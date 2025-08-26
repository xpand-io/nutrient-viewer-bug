import "/pspdfkit-lib.js";

async function allTextLines() {
  const textLines = await Promise.all(
    Array.from({ length: instance.totalPageCount }).map(
      async (_, pageIndex) => {
        const textLines = await instance.textLinesForPageIndex(pageIndex);
        return textLines.toArray();
      },
    ),
  );

  return textLines.flat();
}

function addRedaction(textLine) {
  return new PSPDFKit.Annotations.RedactionAnnotation({
    id: PSPDFKit.generateInstantId(),
    pageIndex: textLine.pageIndex,
    boundingBox: textLine.boundingBox,
    rects: PSPDFKit.Immutable.List([textLine.boundingBox]),
    fillColor: PSPDFKit.Color.WHITE,
  });
}

function addSignatureField(pageIndex, boundingBox, index) {
  const fieldName = `signature_${index}`;

  const widget = new PSPDFKit.Annotations.WidgetAnnotation({
    id: PSPDFKit.generateInstantId(),
    pageIndex,
    boundingBox,
    formFieldName: fieldName,
    horizontalAlign: "left",
    verticalAlign: "top",
  });

  const formField = new PSPDFKit.FormFields.SignatureFormField({
    annotationIds: PSPDFKit.Immutable.List([widget.id]),
    name: fieldName,
    required: true,
  });

  return [widget, formField];
}

async function replacePlaceholders() {
  const textLines = await allTextLines();
  if (!textLines) return null;

  const changes = [];

  textLines.forEach((textLine, index) => {
    const contents = textLine.contents.trim().toLowerCase();

    if (contents === "[[signature]]") {
      changes.push(
        addRedaction(textLine),
        ...addSignatureField(textLine.pageIndex, textLine.boundingBox, index),
      );
    }
  });

  return changes;
}

function updateContainerHeight(container, instance) {
  let containerHeight = container.offsetWidth * Math.SQRT2;
  containerHeight += instance.viewState.viewportPadding.vertical * 2;
  container.style.height = `${containerHeight}px`;
}

const STORAGE_KEY = "signatures_storage";
const ATTACHMENTS_KEY = "attachments_storage";

const licenseKey = "";
const fileName = "/test1.pdf";
const container = document.getElementById("viewer");
const baseUrl = `${window.location.protocol}//${window.location.host}/`;

let instance = await PSPDFKit.load({
  headless: true,
  licenseKey,
  baseUrl,
  container,
  document: fileName,
});

updateContainerHeight(container, instance);

const creates = await replacePlaceholders();
if (creates) {
  const redactions = creates.filter(
    (create) => create instanceof PSPDFKit.Annotations.RedactionAnnotation,
  );
  const annotations = creates.filter(
    (create) => !(create instanceof PSPDFKit.Annotations.RedactionAnnotation),
  );

  await instance.create(redactions);
  await instance.applyRedactions();

  await instance.create(annotations);
}

const pdf = await instance.exportPDF();

PSPDFKit.unload(instance);

instance = await PSPDFKit.load({
  licenseKey,
  baseUrl,
  container,
  document: pdf,
  useIframe: true,
  initialViewState: new PSPDFKit.ViewState({
    zoom: PSPDFKit.ZoomMode.FIT_TO_WIDTH,
    viewportPadding: {
      horizontal: 0,
      vertical: 15,
    },
    spreadSpacing: 2,
    showToolbar: false,
  }),
  populateStoredSignatures,
  electronicSignatures: {
    creationModes: [
      PSPDFKit.ElectronicSignatureCreationMode.DRAW,
      PSPDFKit.ElectronicSignatureCreationMode.TYPE,
    ],
  },
});

async function populateStoredSignatures() {
  const signaturesString = localStorage.getItem(STORAGE_KEY);
  const storedSignatures = signaturesString ? JSON.parse(signaturesString) : [];

  const attachmentsString = localStorage.getItem(ATTACHMENTS_KEY);
  if (attachmentsString) {
    const attachmentsArray = JSON.parse(attachmentsString);
    const blobs = await Promise.all(
      attachmentsArray.map(async ({ url }) => {
        const response = await fetch(url);
        return response.blob();
      }),
    );

    await Promise.all(blobs.map(instance.createAttachment));
  }

  return PSPDFKit.Immutable.List(
    storedSignatures.map(PSPDFKit.Annotations.fromSerializableObject),
  );
}

// Copied from https://www.nutrient.io/guides/web/signatures/signature-storage/
instance.addEventListener("storedSignatures.create", async (annotation) => {
  const signaturesString = localStorage.getItem(STORAGE_KEY);
  const storedSignatures = signaturesString ? JSON.parse(signaturesString) : [];

  const serializedAnnotation =
    PSPDFKit.Annotations.toSerializableObject(annotation);

  if (annotation.imageAttachmentId) {
    const attachment = await instance.getAttachment(
      annotation.imageAttachmentId,
    );
    const url = await fileToDataURL(attachment);
    const attachmentsString = localStorage.getItem(ATTACHMENTS_KEY);
    const attachmentsArray = attachmentsString
      ? JSON.parse(attachmentsString)
      : [];

    attachmentsArray.push({ url, id: annotation.imageAttachmentId });
    localStorage.setItem(ATTACHMENTS_KEY, JSON.stringify(attachmentsArray));
  }

  storedSignatures.push(serializedAnnotation);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(storedSignatures));
  instance.setStoredSignatures((signatures) => signatures.push(annotation));
});

// Copied from https://www.nutrient.io/guides/web/signatures/signature-storage/
instance.addEventListener("storedSignatures.delete", (annotation) => {
  const signaturesString = localStorage.getItem(STORAGE_KEY);
  const storedSignatures = signaturesString ? JSON.parse(signaturesString) : [];

  const annotations = storedSignatures.map(
    PSPDFKit.Annotations.fromSerializableObject,
  );

  const updatedAnnotations = annotations.filter(
    (currentAnnotation) => !currentAnnotation.equals(annotation),
  );

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(
      updatedAnnotations.map(PSPDFKit.Annotations.toSerializableObject),
    ),
  );

  instance.setStoredSignatures((signatures) =>
    signatures.filter((signature) => !signature.equals(annotation)),
  );

  if (annotation.imageAttachmentId) {
    const attachmentsString = localStorage.getItem(ATTACHMENTS_KEY);
    if (attachmentsString) {
      let attachmentsArray = JSON.parse(attachmentsString);
      attachmentsArray = attachmentsArray.filter(
        (attachment) => attachment.id !== annotation.imageAttachmentId,
      );
      localStorage.setItem(ATTACHMENTS_KEY, JSON.stringify(attachmentsArray));
    }
  }
});
