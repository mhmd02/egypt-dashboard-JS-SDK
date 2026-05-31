import { API_KEY, GOV_URL, ISSUES_URL } from "./config.js";

require([
    "esri/config",
    "esri/layers/FeatureLayer",
    "esri/renderers/ClassBreaksRenderer",
    "esri/renderers/UniqueValueRenderer",
    "esri/symbols/SimpleFillSymbol",
    "esri/symbols/SimpleMarkerSymbol",
    "esri/PopupTemplate",
    "esri/Graphic",
    "esri/widgets/Search",
    "esri/core/reactiveUtils"
], function (
    esriConfig,
    FeatureLayer,
    ClassBreaksRenderer,
    UniqueValueRenderer,
    SimpleFillSymbol,
    SimpleMarkerSymbol,
    PopupTemplate,
    Graphic,
    Search,
    reactiveUtils
) {
    // Configure API Key
    esriConfig.apiKey = API_KEY;

    // Wait for the map component to be ready
    const mapElement = document.getElementById("main-map");
    
    mapElement.addEventListener("arcgisViewReadyChange", (event) => {
        const view = event.target.view;
        const map = view.map;

        // Immediately move the camera to Egypt
        view.goTo({
            center: [30, 27], // Longitude, Latitude for Egypt
            zoom: 6
        }, { duration: 0 }); // duration: 0 makes it instant without a sweeping animation

        // ==========================================
        // PART 1: Governorates Visualization
        // ==========================================
        
        const govRenderer = new ClassBreaksRenderer({
            field: "Population",
            defaultSymbol: new SimpleFillSymbol({
                color: "#e0e0e0",
                outline: { color: "#ffffff", width: 1 }
            }),
            classBreakInfos: [
                {
                    minValue: 0,
                    maxValue: 1000000,
                    symbol: new SimpleFillSymbol({ color: "#e3f2fd", outline: { color: "#ffffff", width: 1 } }),
                    label: "0 - 1,000,000"
                },
                {
                    minValue: 1000001,
                    maxValue: 3000000,
                    symbol: new SimpleFillSymbol({ color: "#90caf9", outline: { color: "#ffffff", width: 1 } }),
                    label: "1,000,001 - 3,000,000"
                },
                {
                    minValue: 3000001,
                    maxValue: 6000000,
                    symbol: new SimpleFillSymbol({ color: "#42a5f5", outline: { color: "#ffffff", width: 1 } }),
                    label: "3,000,001 - 6,000,000"
                },
                {
                    minValue: 6000001,
                    maxValue: 15000000,
                    symbol: new SimpleFillSymbol({ color: "#1e88e5", outline: { color: "#ffffff", width: 1 } }),
                    label: "> 6,000,000"
                }
            ]
        });

        const govPopupTemplate = new PopupTemplate({
            title: "{Name_En} Governorate",
            content: [{
                type: "fields",
                fieldInfos: [
                    {
                        fieldName: "Population",
                        label: "Population",
                        format: { digitSeparator: true }
                    },
                    {
                        fieldName: "Area_KM2",
                        label: "Area (KM²)",
                        format: { digitSeparator: true, places: 2 }
                    },
                    {
                        fieldName: "expression/density"
                    }
                ]
            }],
            expressionInfos: [{
                name: "density",
                title: "Population Density (people/km²)",
                expression: "Round($feature.Population / $feature.Area_KM2, 2)"
            }]
        });

        const govLayer = new FeatureLayer({
            url: GOV_URL,
            renderer: govRenderer,
            popupTemplate: govPopupTemplate,
            outFields: ["*"],
            title: "Governorates"
        });

        map.add(govLayer);

        // ==========================================
        // PART 2: Operational Issues (Reporting System)
        // ==========================================

        const issuesRenderer = new UniqueValueRenderer({
            field: "IssueType",
            defaultSymbol: new SimpleMarkerSymbol({ color: "gray" }),
            uniqueValueInfos: [
                {
                    value: "Violating Buildings",
                    symbol: new SimpleMarkerSymbol({
                        color: "red",
                        style: "square",
                        size: "12px",
                        outline: { color: "white", width: 1 }
                    })
                },
                {
                    value: "Street Issues",
                    symbol: new SimpleMarkerSymbol({
                        color: "orange",
                        style: "triangle",
                        size: "14px",
                        outline: { color: "white", width: 1 }
                    })
                }
            ]
        });

        const issuesLayer = new FeatureLayer({
            url: ISSUES_URL,
            renderer: issuesRenderer,
            outFields: ["*"],
            title: "Reported Issues",
            popupTemplate: {
                title: "{IssueType}",
                content: "<b>Description:</b> {Description}<br><b>Reported At:</b> {ReportedAt}"
            }
        });

        map.add(issuesLayer);

        // -- Reporting Logic --
        const reportBtn = document.getElementById("report-btn");
        const reportNotice = document.getElementById("report-notice");
        const reportTypeSelect = document.getElementById("report-type");
        const reportDescTextarea = document.getElementById("report-desc");
        const successAlert = document.getElementById("success-alert");
        
        let isReportingMode = false;
        let mapClickHandler = null;

        reportBtn.addEventListener("click", () => {
            isReportingMode = !isReportingMode;
            
            if (isReportingMode) {
                reportBtn.setAttribute("appearance", "solid");
                reportBtn.setAttribute("kind", "danger");
                reportBtn.innerText = "Cancel Reporting";
                reportNotice.style.display = "block";
                view.container.classList.add("reporting-mode-cursor");

                mapClickHandler = view.on("click", (event) => {
                    event.stopPropagation(); // Prevent popup from opening

                    const newGraphic = new Graphic({
                        geometry: event.mapPoint,
                        attributes: {
                            IssueType: reportTypeSelect.value,
                            Description: reportDescTextarea.value || "No description provided",
                            ReportedAt: new Date().getTime() 
                        }
                    });

                    disableReportingMode();

                    issuesLayer.applyEdits({
                        addFeatures: [newGraphic]
                    }).then((results) => {
                        if (results.addFeatureResults.length > 0 && !results.addFeatureResults[0].error) {
                            successAlert.setAttribute("active", "true");
                            reportDescTextarea.value = ""; 
                        } else {
                            console.error("Error adding feature", results);
                            alert("Failed to report issue. See console for details.");
                        }
                    }).catch(err => {
                        console.error("ApplyEdits error", err);
                    });
                });

            } else {
                disableReportingMode();
            }
        });

        function disableReportingMode() {
            isReportingMode = false;
            reportBtn.setAttribute("appearance", "solid");
            reportBtn.setAttribute("kind", "brand");
            reportBtn.innerText = "Select Location on Map";
            reportNotice.style.display = "none";
            view.container.classList.remove("reporting-mode-cursor");
            if (mapClickHandler) {
                mapClickHandler.remove();
                mapClickHandler = null;
            }
        }

        // ==========================================
        // PART 3: Filtering Reported Issues
        // ==========================================
        const filterSelect = document.getElementById("issue-filter");
        filterSelect.addEventListener("calciteSelectChange", (e) => {
            const selectedType = e.target.value;
            if (selectedType === "All") {
                issuesLayer.definitionExpression = null;
            } else {
                issuesLayer.definitionExpression = `IssueType = '${selectedType}'`;
            }
        });

        // ==========================================
        // BONUS: Search Widget
        // ==========================================
        const searchWidget = new Search({
            view: view,
            includeDefaultSources: false,
            sources: [{
                layer: govLayer,
                searchFields: ["Name_En", "Name_Ar"],
                displayField: "Name_En",
                exactMatch: false,
                outFields: ["*"],
                name: "Governorates",
                placeholder: "Search Governorates (e.g. Cairo)"
            }]
        });
        view.ui.add(searchWidget, "top-right");

        // ==========================================
        // BONUS: Dashboard Counts
        // ==========================================
        const totalCountEl = document.getElementById("total-issues-count");
        const visibleCountEl = document.getElementById("visible-issues-count");

        view.whenLayerView(issuesLayer).then((layerView) => {
            const updateCounts = async () => {
                try {
                    // Query the server-side layer for the true total (respecting filters, but ignoring extent)
                    const totalQuery = issuesLayer.createQuery();
                    // We don't set a geometry, so it queries everything matching the current definitionExpression
                    const totalCount = await issuesLayer.queryFeatureCount(totalQuery);
                    totalCountEl.innerText = totalCount;

                    // Query the client-side layerView for features in the current map extent
                    const extentQuery = layerView.createQuery();
                    extentQuery.geometry = view.extent;
                    extentQuery.spatialRelationship = "intersects";
                    const visibleCount = await layerView.queryFeatureCount(extentQuery);
                    visibleCountEl.innerText = visibleCount;
                } catch (err) {
                    console.error("Error querying counts", err);
                }
            };

            reactiveUtils.watch(
                () => [view.extent, issuesLayer.definitionExpression],
                () => updateCounts()
            );

            layerView.watch("updating", (val) => {
                if (!val) updateCounts();
            });
        }).catch(console.error);
    });
});