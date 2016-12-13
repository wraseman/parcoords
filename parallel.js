let pc0;

// color scale for zscores
const colorscale = d3.scale.linear()
    .domain([0,1])
    .range(["blue", "red"])
    .interpolate(d3.interpolateLab);

queue()
    .defer(d3.csv, './data/data.csv')
    .await(processData);

// smoothness slider
d3.select("#smoothness").on("change", function() {
    d3.select("#smooth").text(this.value);
    pc0.smoothness(this.value).render();
});

// bundling strength slider
d3.select("#bundling").on("change", function() {
    d3.select("#strength").text(this.value);
    pc0.bundlingStrength(this.value).render();
});

function processData(error, data) {
    const header = d3.keys(data[0]);
    const dimensionNames = header.slice(1);

    data.forEach(function (d) {
        for (let key of header) {
            d[key] = +d[key]
        }
    });

    // we want to exclude key from the shown dimensions
    const dimensions = {};
    for (let name of dimensionNames) {
        dimensions[name] = {title: name, type: "number"}
    }

    pc0 = d3.parcoords()("#example");
    pc0.data(data)
        .bundlingStrength(0) // set bundling strength
        .smoothness(0)
        .bundleDimension("obj 0")
        .showControlPoints(false)
        .composite("darken")
        .dimensions(dimensions) // should be called right before render
        .render()
        .brushMode("1D-axes")
        .reorderable();

    pc0.svg.selectAll("text")
        .style("font", "10px");

    // click dimension to activate coloring
    pc0.svg.selectAll(".dimension")
        .on("click", change_color)
        .selectAll(".label")
        .style("font-size", "14px");
    change_color("obj 0");

    const select = d3.select("#bundleDimension")
        .append("select")
        .on("change", function(){
            pc0.bundleDimension(this.value);
            pc0.render();
        });

    // fill the drop down box with the names of the dimensions
    select.selectAll('option')
        .data(d3.keys(pc0.dimensions()))
        .enter()
        .append("option")
        .attr("value", function(d) {return d;})
        .text(function(d) {return d;});
}

function saveSVG(){
    // This is a bit of a hack, but here goes
    // we are going to replace the canvas.context with another context
    // that generates svg but has the same interface as a canvas.context. Next, we
    // extract the svg from this. After this we put back the original
    // contexts. The reason for this last step is that
    // the scaling of the temporary context is wrong, probably due to retina
    // specific scaling moreover.
    // TODO:: layers are safed as seperate groups, but still displayed
    // TODO:: include all css information
    const layerNames = ["marks", "highlight", "brushed", "foreground"];


    // for a good starting point, see http://stackoverflow.com/questions/8571294/method-to-convert-html5-canvas-to-svg
    // I use http://gliffy.github.io/canvas2svg/
    // it is one of the more recent libraries and saves the SVG nicely by layer
    const oldLayers = {};
    let oldLayerContext;
    let newLayerContext;
    let layerName;
    for (let i=0; i<layerNames.length; i++){
        layerName = layerNames[i];

        oldLayerContext = pc0.ctx[layerName];
        newLayerContext = new C2S(720, 200); //TODO:: should be extracted explicitly from css

        oldLayers[layerName] = oldLayerContext;
        pc0.ctx[layerName] = newLayerContext;
    }
    pc0.render();

    //get svg axis
    const svgAxis = new XMLSerializer().serializeToString(d3.select('svg').node());
    const axisXmlDocument = $.parseXML(svgAxis);

    // we need to add the css styling information explicitly
    // this is an incomplete subset of the relevant styles
    setAttributeByTag(axisXmlDocument, "axis", "fill", "none");
    setAttributeByTag(axisXmlDocument, "path", "stroke", "#222");
    setAttributeByTag(axisXmlDocument, "line", "stroke", "#222");
    setAttributeByClass(axisXmlDocument, "background", "fill", "none");

    // add a new node into which we are going to add the lines
    // by copying the node from the axis svg, we get the
    // transform and other info, so the lines and the axis are
    // positioned in the same way
    const oldNode = axisXmlDocument.getElementsByTagName('g')[0];
    const newNode = oldNode.cloneNode(true);
    while (newNode.hasChildNodes()){
        newNode.removeChild(newNode.lastChild);
    }

    // we add the new node at the top. This is a bit of a hack
    // groups are rendered on top of each other, so by having the axis layer as last
    // they are displayed on top,
    // this also motivated the order of the layerNames
    axisXmlDocument.documentElement.insertBefore(newNode, oldNode);

    // add all lines to the newly created node
    let svgLines;
    let xmlDocument;
    for (let i=0; i<layerNames.length; i++){
        // get svg for layer
        layerName = layerNames[i];
        svgLines = pc0.ctx[layerName].getSerializedSvg(true);
        xmlDocument = $.parseXML(svgLines);

        // scale is set to 2,2 on retina screens, this is relevant for canvas
        // not for svg, so we explicitly overwrite it
        xmlDocument.getElementsByTagName("g")[0].setAttribute("transform", "scale(1,1)");

        // for convenience add the name of the layer to the group as class
        xmlDocument.getElementsByTagName("g")[0].setAttribute("class", layerName);

        // add the group to the node
        // each layers has 2 nodes, a defs node and the actual svg
        // we can safely ignore the defs node
        newNode.appendChild(xmlDocument.documentElement.childNodes[1]);
    }

    // turn merged xml document into string
    // we also beautify the string, but this is optional
    const merged = vkbeautify.xml(new XMLSerializer().serializeToString(axisXmlDocument.documentElement));

    // turn the string into a blob and use FileSaver.js to enable saving it
    const blob = new Blob([merged], {type:"application/svg+xml"});
    saveAs(blob, "parcoords.svg");

    // we are done extracting the SVG information so
    // put the original canvas contexts back
    for (let i=0; i<layerNames.length; i++){
        pc0.ctx[layerNames[i]] = oldLayers[layerNames[i]]
    }
    pc0.render();
}

// helper function for saving svg
function setAttributeByTag(xmlDocument, tagName, attribute, value){
    const paths = xmlDocument.getElementsByTagName(tagName);
    for (let i = 0; i < paths.length; i++) {
        paths[i].setAttribute(attribute, value);
    }
}

// helper function for saving svg
function setAttributeByClass(xmlDocument, className, attribute, value){
    const paths = xmlDocument.getElementsByClassName(className);
    for (let i = 0; i < paths.length; i++) {
        paths[i].setAttribute(attribute, value);
    }
}

// update color
function change_color(dimension) {
    pc0.svg.selectAll(".dimension")
        .style("font-weight", "normal")
        .filter(function(d) { return d == dimension; })
        .style("font-weight", "bold")

    pc0.color(color(pc0.data(),dimension)).render()
}

// return color function based on plot and dimension
function color(col, dimension) {
    const z = normalize(_(col).pluck(dimension).map(parseFloat));
    return function(d) { return colorscale(z(d[dimension])) }
}

// normalize data
function normalize(col) {
    const n = col.length;
    const min = _(col).min();
    const max = _(col).max();

    return function(d) {
        return (d-min)/(max-min);
    };
}

