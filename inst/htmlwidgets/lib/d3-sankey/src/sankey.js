//import {ascending, min, sum} from "d3-array";
//import {nest} from "d3-collection";
//import {number} from "d3-interpolate";

d3.sankey = function() {
  var sankey = {},
      nodeWidth = 24,
      nodePadding = 8,
      size = [1, 1],
      align = 'justify', // left, right, center, justify or none
      linkType = 'bezier',
      reverse = false,
      orderByPath = false,
      scaleNodeBreadthsByString = false,
      curvature = .5,
      nodes = [],
      links = [];

  sankey.nodeWidth = function(_) {
    if (!arguments.length) return nodeWidth;
    nodeWidth = +_;
    return sankey;
  };

  sankey.nodePadding = function(_) {
    if (!arguments.length) return nodePadding;
    nodePadding = +_;
    return sankey;
  };

  sankey.nodes = function(_) {
    if (!arguments.length) return nodes;
    nodes = _;
    return sankey;
  };

  sankey.links = function(_) {
    if (!arguments.length) return links;
    links = _;
    return sankey;
  };
  
  sankey.orderByPath = function(_) {
    if (!arguments.length) return orderByPath;
    orderByPath = _;
    return sankey;
  };
  
  sankey.curvature = function(_) {
    if (!arguments.length) return curvature;
    curvature = _;
    return sankey;
  };

  sankey.linkType = function(_) {
    if (!arguments.length) return linkType;
    linkType = _.toLowerCase();
    return sankey;
  };

  sankey.size = function(_) {
    if (!arguments.length) return size;
    size = _;
    return sankey;
  };

  sankey.align = function(_) {
    if (!arguments.length) return align;
    align = _.toLowerCase();
    return sankey;
  };
  
  sankey.scaleNodeBreadthsByString = function(_) {
    if (!arguments.length) return scaleNodeBreadthsByString;
    scaleNodeBreadthsByString = _;
    return sankey;
  };


  sankey.layout = function(iterations) {
    computeNodeLinks();
    computeNodeValues();
    computeNodeBreadths();
    computeNodeDepths(iterations);
    computeLinkDepths();
    return sankey;
  };

  sankey.relayout = function() {
    computeLinkDepths();
    return sankey;
  };

  // SVG path data generator, to be used as "d" attribute on "path" element selection.
  sankey.link = function() {
    function link(d) {
      console.log(d)
      var x0 = d.source.x + d.source.dx,
          x1 = d.target.x,
          xi = d3.interpolateNumber(x0, x1),
          x2 = xi(curvature),
          x3 = xi(1 - curvature),
          y0 = d.source.y + d.sy + d.dy / 2,
          y1 = d.target.y + d.ty + d.dy / 2;
          
      if (!d.cycleBreaker) {
        if (linkType == "bezier") {
          return "M" + x0 + "," + y0
           + "C" + x2 + "," + y0
           + " " + x3 + "," + y1
           + " " + x1 + "," + y1;
          
        } else if (linkType == "l-bezier") {
          // from @michealgasser pull request #120 to d3/d3-plugins
        x4 = x0 + d.source.dx/4
        x5 = x1 - d.target.dx/4
        x2 = Math.max(xi(curvature), x4+d.dy)
        x3 = Math.min(xi(curvature), x5-d.dy)
      return "M" + x0 + "," + y0
           + "L" + x4 + "," + y0
		       + "C" + x2 + "," + y0
		       + " " + x3 + "," + y1
		       + " " + x5 + "," + y1
           + "L" + x1 + "," + y1;
        } else if (linkType == "trapez") {
          // TRAPEZOID connection
          return "M" + (x0) + "," + (y0 - d.dy/2)
               + "L" + (x0) + "," + (y0 + d.dy/2)
               + " " + (x1) + "," + (y1 + d.dy/2)
               + " " + (x1) + "," + (y1 - d.dy/2) + " z";
        }

      } else {
        var xdelta = (1.5 * d.dy + 0.05 * Math.abs(xs - xt));
        xsc = xs + xdelta;
        xtc = xt - xdelta;
        var xm = xi(0.5);
        var ym = d3.interpolateNumber(ys, yt)(0.5);
        var ydelta = (2 * d.dy + 0.1 * Math.abs(xs - xt) + 0.1 * Math.abs(ys - yt)) * (ym < (size[1] / 2) ? -1 : 1);
        return "M" + xs + "," + ys
             + "C" + xsc + "," + ys
             + " " + xsc + "," + (ys + ydelta)
             + " " + xm + "," + (ym + ydelta)
             + "S" + xtc + "," + yt
             + " " + xt + "," + yt;

      }
    }

    link.curvature = function(_) {
      if (!arguments.length) return curvature;
      curvature = +_;
      return link;
    };

    return link;
  };

  // Populate the sourceLinks and targetLinks for each node.
  // Also, if the source and target are not objects, assume they are indices.
  function computeNodeLinks() {
    nodes.forEach(function(node) {
      // Links that have this node as source.
      node.sourceLinks = [];
      // Links that have this node as target.
      node.targetLinks = [];
    });
    links.forEach(function(link) {
      var source = link.source,
          target = link.target;
      if (typeof source === "number") source = link.source = nodes[link.source];
      if (typeof target === "number") target = link.target = nodes[link.target];
      source.sourceLinks.push(link);
      target.targetLinks.push(link);
    });
  }

  // Compute the value (size) of each node by summing the associated links.
  function computeNodeValues() {
    if (typeof nodes[0].value == "undefined") {
      nodes.forEach(function(node) {
        node.value = Math.max(
          d3.sum(node.sourceLinks, value),
          d3.sum(node.targetLinks, value)
        );
      });
    }
  }

  var summed_str_length = [0];

  // Iteratively assign the breadth (x-position) for each node.
  // Nodes are assigned the maximum breadth of incoming neighbors plus one;
  // nodes with no incoming links are assigned breadth zero, while
  // nodes with no outgoing links are assigned the maximum breadth.
  function computeNodeBreadths() {
    var reverse = (align === 'right'); // Reverse traversal direction

    if (typeof nodes[0].posX == "undefined") {
      var remainingNodes = nodes,
          x = 0,
          nextNodes;
      // Work from left to right.
      // Keep updating the breath (x-position) of nodes that are target of recently updated nodes.
      while (remainingNodes.length && x < nodes.length) {
        nextNodes = [];
        remainingNodes.forEach(function(node) {
          node.x = x;
          node.posX = x;
          node.dx = nodeWidth;

          node[reverse ? 'targetLinks' : 'sourceLinks'].forEach(function(link) {
            var nextNode = link[reverse ? 'source' : 'target'];
            if (nextNodes.indexOf(nextNode) < 0) {
              nextNodes.push(nextNode);
            }
          });
        });
        if (nextNodes.length == remainingNodes.length) {
          // There must be a cycle here. Let's search for a link that breaks it.
          findAndMarkCycleBreaker(nextNodes);
          // Start over.
          // TODO: make this optional?
          return computeNodeBreadths();
        }
        else {
          remainingNodes = nextNodes;
          ++x;
        }
      }
    } else {
        nodes.forEach(function(node) {
            node.x = node.posX;
        });
    }
    
    // calculate maximum string lengths at each posX
    var max_posX = d3.max(nodes, function(d) { return(d.posX); } ) + 1;
    var max_str_length = new Array(max_posX);
    nodes.forEach(function(node) {
        if (typeof max_str_length[node.x] == "undefined" || node.name.length > max_str_length[node.x]) {
            max_str_length[node.x] = node.name.length;
        }

        // make a path to the beginning for vertical ordering
        if (orderByPath) {
          node.path = node.name;
          nn = node
          while (nn.targetLinks.length) {
              if (nn.targetLinks.length > 1) {
                console.log("Error - orderByPath not useful when there is more than one parent for a node.")
              }
              nn = nn.targetLinks[0].source
              node.path = nn.name + ";" + node.path;
          }
        }

    });

    for (i=1; i<max_posX; ++i) {
        summed_str_length[i] = summed_str_length[i-1] + max_str_length[i-1] * 6 + nodeWidth + nodePadding;
    }

    if (reverse) {
      // Flip nodes horizontally
      nodes.forEach(function(node) {
        node.x *= -1;
        node.x += x - 1;
      });
    }

    if (align === 'center') {
      moveSourcesRight();
    }
    if (align === 'justify') {
      moveSinksRight(max_posX);
    }
    if (align == 'none') {
      scaleNodeBreadths((size[0] - nodeWidth) / (max_posX));
    } else {
      scaleNodeBreadths((size[0] - nodeWidth) / (max_posX - 1));
    }
  }

  // Find a link that breaks a cycle in the graph (if any).
  function findAndMarkCycleBreaker(nodes) {
  // Go through all nodes from the given subset and traverse links searching for cycles.
    var link;
    for (var n=nodes.length - 1; n >= 0; n--) {
      link = depthFirstCycleSearch(nodes[n], []);
      if (link) {
        return link;
      }
    }

    // Depth-first search to find a link that is part of a cycle.
    function depthFirstCycleSearch(cursorNode, path) {
      var target, link;
      for (var n = cursorNode.sourceLinks.length - 1; n >= 0; n--) {
        link = cursorNode.sourceLinks[n];
        if (link.cycleBreaker) {
          // Skip already known cycle breakers.
          continue;
        }

        // Check if target of link makes a cycle in current path.
        target = link.target;
        for (var l = 0; l < path.length; l++) {
          if (path[l].source == target) {
            // We found a cycle. Search for weakest link in cycle
            var weakest = link;
            for (; l < path.length; l++) {
              if (path[l].value < weakest.value) {
                weakest = path[l];
              }
            }
            // Mark weakest link as (known) cycle breaker and abort search.
            weakest.cycleBreaker = true;
            return weakest;
          }
        }

        // Recurse deeper.
        path.push(link);
        link = depthFirstCycleSearch(target, path);
        path.pop();
        // Stop further search if we found a cycle breaker.
        if (link) {
          return link;
        }
      }
    }
  }

  function moveSourcesRight() {
    nodes.slice()
      // Pack nodes from right to left
      .sort(function(a, b) { return b.x - a.x; })
      .forEach(function(node) {
        if (!node.targetLinks.length) {
          node.x = d3.min(node.sourceLinks, function(d) { return d.target.x; }) - 1;
        }
      });
  }

  function moveSinksRight(x) {
    nodes.forEach(function(node) {
      if (!node.sourceLinks.length) {
        node.x = x - 1;
      } else {
        //move node to second from right 
        var nodes_to_right = 0;
        node.sourceLinks.forEach(function(n) {
          nodes_to_right = Math.max(nodes_to_right,n.target.sourceLinks.length)
        })
         if (nodes_to_right==0)node.x = x - 2;
      }
    });
  }

  function scaleNodeBreadths(kx) {
    nodes.forEach(function(node) {
      if (scaleNodeBreadthsByString) {
        node.x = summed_str_length[node.x];
      } else {
        node.x *= kx;
      }
    });
  }

  // Compute the depth (y-position) for each node.
  function computeNodeDepths(iterations) {

    var more_nodes = nodes;
    var nodesByBreadth;
    
    if (orderByPath) {
      nodesByBreadth = new Array(max_posX);
      for (i=0; i < nodesByBreadth.length; ++i) {
          nodesByBreadth[i] = [];
      }
      
      // Add 'invisible' nodes to account for different depths
      for (posX=0; posX < max_posX; ++posX) {
          for (j=0; j < nodes.length; ++j) {
              if (nodes[j].posX != posX) {
                  continue;
              }
              node = nodes[j];
              nodesByBreadth[posX].push(node);
              if (node.sourceLinks.length && node.sourceLinks[0].target.posX > node.posX +1) {
                  for (new_node_posX=node.posX+1; new_node_posX < node.sourceLinks[0].target.posX; ++new_node_posX) {
                      var new_node = node.constructor();
                      new_node.posX = new_node_posX;
                      new_node.dy = node.dy;
                      new_node.y = node.y;
                      new_node.value = node.value;
                      new_node.path = node.path;
                      new_node.sourceLinks = node.sourceLinks;
                      new_node.targetLinks = node.targetLinks;
                      nodesByBreadth[new_node_posX].push(new_node);
                  }
              }
          }
      }
    } else {
      nodesByBreadth = d3.nest()
                             .key(function(d) { return d.x; })
                             .sortKeys(function(a, b) { return a - b; }) // pull request #124 in d3/d3-plugins
                             .entries(nodes)
                             .map(function(d) { return d.values; });

    }

    // Group nodes by breath.
    //var nodesByBreadth = d3.nest()
    //    .key(function(d) { return d.x; })
    //    .sortKeys(d3.ascending)
    //    .entries(nodes)
    //    .map(function(d) { return d.values; });

    initializeNodeDepth();
    resolveCollisions();
    for (var alpha = 1; iterations > 0; --iterations) {
      relaxRightToLeft(alpha *= .99);
      resolveCollisions();
      relaxLeftToRight(alpha);
      resolveCollisions();
    }

    function initializeNodeDepth() {
      // Calculate vertical scaling factor.
      var ky = d3.min(nodesByBreadth, function(nodes) {
        return (size[1] - (nodes.length - 1) * nodePadding) / d3.sum(nodes, value);
      });

      nodesByBreadth.forEach(function(nodes) {
        nodes.forEach(function(node, i) {
          node.y = i;
          node.dy = node.value * ky;
        });
      });

      links.forEach(function(link) {
        link.dy = link.value * ky;
      });
    }

    function relaxLeftToRight(alpha) {
      nodesByBreadth.forEach(function(nodes) {
        nodes.forEach(function(node) {
          if (node.targetLinks.length) {
            // Value-weighted average of the y-position of source node centers linked to this node.
            var y = d3.sum(node.targetLinks, weightedSource) / d3.sum(node.targetLinks, value);
            node.y += (y - center(node)) * alpha;
          }
        });
      });

      function weightedSource(link) {
        return center(link.source) * link.value;
      }
    }

    function relaxRightToLeft(alpha) {
      nodesByBreadth.slice().reverse().forEach(function(nodes) {
        nodes.forEach(function(node) {
          if (node.sourceLinks.length) {
            // Value-weighted average of the y-positions of target nodes linked to this node.
            var y = d3.sum(node.sourceLinks, weightedTarget) / d3.sum(node.sourceLinks, value);
            node.y += (y - center(node)) * alpha;
          }
        });
      });

      function weightedTarget(link) {
        return center(link.target) * link.value;
      }
    }

    function resolveCollisions() {
      nodesByBreadth.forEach(function(nodes) {
        var node,
            dy,
            y0 = 0,
            n = nodes.length,
            i;

        // Push any overlapping nodes down.
        nodes.sort(ascendingDepth);
        for (i = 0; i < n; ++i) {
          node = nodes[i];
          dy = y0 - node.y;
          if (dy > 0) node.y += dy;
          y0 = node.y + node.dy + nodePadding;
        }

        // If the bottommost node goes outside the bounds, push it back up.
        dy = y0 - nodePadding - size[1];
        if (dy > 0) {
          y0 = node.y -= dy;

          // Push any overlapping nodes back up.
          for (i = n - 2; i >= 0; --i) {
            node = nodes[i];
            dy = node.y + node.dy + nodePadding - y0;
            if (dy > 0) node.y -= dy;
            y0 = node.y;
          }
        }
      });
    }

    function ascendingDepth(a, b) {
      if (orderByPath) {
        return ( a.path < b.path ? -1 : (a.path > b.path ? 1 : 0 ));
      } else {
        return a.y - b.y;
      }
    }
  }

  // Compute y-offset of the source endpoint (sy) and target endpoints (ty) of links,
  // relative to the source/target node's y-position.
  // includes fix by @gmadrid in pull request #74 in d3/d3-plugins
  function computeLinkDepths() {
    nodes.forEach(function(node) {
      node.sourceLinks.sort(ascendingTargetDepth);
    });
    nodes.forEach(function(node) {
      var sy = 0;
      node.sourceLinks.forEach(function(link) {
        link.sy = sy;
        sy += link.dy;
      });
    });
    nodes.forEach(function(node) {
      node.targetLinks.sort(descendingLinkSlope);
    });
    nodes.forEach(function(node) {
      var ty = 0;
      node.targetLinks.forEach(function(link) {
        link.ty = ty;
        ty += link.dy;
      });
    });

    function descendingLinkSlope(a, b) {
        function slope(l) {
          return (l.target.y - (l.source.y + l.sy)) /
              (l.target.x - l.source.x);
        }
        return slope(b) - slope(a);
    }
    function ascendingSourceDepth(a, b) {
      return a.source.y - b.source.y;
    }

    function ascendingTargetDepth(a, b) {
      return a.target.y - b.target.y;
    }
  }

  // Y-position of the middle of a node.
  function center(node) {
    return node.y + node.dy / 2;
  }

  // Value property accessor.
  function value(x) {
    return x.value;
  }

  return sankey;
};
