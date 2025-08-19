import "/nutrient-viewer.js";

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
  return new NutrientViewer.Annotations.RedactionAnnotation({
    id: NutrientViewer.generateInstantId(),
    pageIndex: textLine.pageIndex,
    boundingBox: textLine.boundingBox,
    rects: NutrientViewer.Immutable.List([textLine.boundingBox]),
    fillColor: NutrientViewer.Color.WHITE,
  });
}

function addSignatureField(pageIndex, boundingBox, index) {
  const fieldName = `signature_${index}`;

  const widget = new NutrientViewer.Annotations.WidgetAnnotation({
    id: NutrientViewer.generateInstantId(),
    pageIndex,
    boundingBox,
    formFieldName: fieldName,
    horizontalAlign: "left",
    verticalAlign: "top",
  });

  const formField = new NutrientViewer.FormFields.SignatureFormField({
    annotationIds: NutrientViewer.Immutable.List([widget.id]),
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

function updateContainerHeight(container) {
  let containerHeight = container.offsetWidth * Math.SQRT2;
  containerHeight += instance.viewState.viewportPadding.vertical * 2;
  container.style.height = `${containerHeight}px`;
}

const licenseKey = "";
const fileName = "/test1.pdf";
const container = document.getElementById("viewer");
const baseUrl = `${window.location.protocol}//${window.location.host}/`;

let instance = await NutrientViewer.load({
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
    (create) =>
      create instanceof NutrientViewer.Annotations.RedactionAnnotation,
  );
  const annotations = creates.filter(
    (create) =>
      !(create instanceof NutrientViewer.Annotations.RedactionAnnotation),
  );

  await instance.create(redactions);
  await instance.applyRedactions();

  await instance.create(annotations);
}

const pdf = await instance.exportPDF();

NutrientViewer.unload(instance);

instance = await NutrientViewer.load({
  licenseKey,
  baseUrl,
  container,
  document: pdf,
  useIframe: document.location.search.includes("useIframe"),
  initialViewState: new NutrientViewer.ViewState({
    zoom: NutrientViewer.ZoomMode.FIT_TO_WIDTH,
    viewportPadding: {
      horizontal: 0,
      vertical: 15,
    },
    spreadSpacing: 2,
    showToolbar: false,
  }),
});
