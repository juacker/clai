this is a sample toolInput for the load_chart_block:


func (t *GetMetricDataTool) getDataV3RequestParams(params *getMetricDataToolInputParams, scopeParams ScopeParams) (*netdata.GetDataV3RequestParams, error) {
	var (
		nodeIDs    = make([]string, 0)
		dimensions = make([]string, 0)
		instances  = make([]string, 0)
		labels     = make([]string, 0)
	)

	for _, filter := range params.FilterBy {
		switch filter.Label {
		case "node":
			nodeIDs = append(nodeIDs, filter.Value)
		case "dimension":
			dimensions = append(dimensions, filter.Value)
		case "instance":
			instances = append(instances, filter.Value)
		default:
			labels = append(labels, fmt.Sprintf("%s:%s", filter.Label, filter.Value))
		}
	}

	var (
		systemLabels   = []string{"node", "dimension", "instance"}
		groupedBy      = make([]string, 0)
		groupedByLabel = make([]string, 0)
		labelAdded     bool
		accessNodes    bool
	)

	nodeIDs, accessNodes = scopeParams.ScopeNodes(nodeIDs)
	if !accessNodes {
		return nil, fmt.Errorf("%w: no access to requested nodes", chat.ErrInvalidToolInputParams)
	}

	for _, label := range params.GroupBy {
		switch {
		case slices.Contains(systemLabels, label):
			groupedBy = append(groupedBy, label)
		default:
			if !labelAdded {
				groupedBy = append(groupedBy, "label")
				labelAdded = true
			}
			groupedByLabel = append(groupedByLabel, label)
		}
	}
	if len(groupedBy) == 0 {
		groupedBy = []string{"dimension"}
	}

	var 	points           = params.IntervalCount

	return &netdata.GetDataV3RequestParams{
		Scope: netdata.Scope{
			Contexts: []string{params.Context},
			Nodes:    nodeIDs,
		},
		Selectors: netdata.Selectors{
			Dimensions: dimensions,
			Instances:  instances,
			Labels:     labels,
		},
		Aggregations: netdata.Aggregations{
			Metrics: []netdata.MetricsAggregation{
				{
					GroupBy:      groupedBy,
					GroupByLabel: groupedByLabel,
					Aggregation:  params.ValueAggregation,
				},
			},
			Time: netdata.TimeAggregation{
				TimeGroup: params.TimeAggregation,
			},
		},
		Window: netdata.Window{
			After: params.After.Unix(),
			Before:params.Before.Unix(),
			Points: points,
		},
	}, nil
}


the idea is to use this same logic to build the getData request params from the toolInput.

The response of the getData will have this schema:


type GetDataV3Response struct {
	Summary struct {
		Nodes      []NodeSummary      `json:"nodes"`
		Instances  []InstanceSummary  `json:"instances"`
		Dimensions []DimensionSummary `json:"dimensions"`
		Labels     []LabelSummary     `json:"labels"`
	} `json:"summary"`
	Result struct {
		Labels []string       `json:"labels"`
		Point  map[string]int `json:"point"`
		Data   [][]any        `json:"data"`
	} `json:"result"`
	View struct {
		Units any `json:"units"`
	} `json:"view"`
}


What we are interested in is in the Result object only for the moment.
This object contains the labels of the metrics and the Data (first label is always time).
The data is an array of row elements, the first element in each row is the timestamp
after the timestamp, each row has as many array elements as metrics received. each of these arrays contains various values, the one we are interested is the index 0, that is the value of each label at the corresponding timestamp for that row.

## practical example

for this request body:

{
	"format": "json2",
	"options": [
		"jsonwrap",
		"nonzero",
		"flip",
		"ms",
		"jw-anomaly-rates",
		"minify"
	],
	"scope": {
		"contexts": [
			"system.cpu"
		],
		"nodes": []
	},
	"selectors": {
		"contexts": [
			"*"
		],
		"nodes": [
			"*"
		],
		"instances": [
			"*"
		],
		"dimensions": [
			"*"
		],
		"labels": [
			"*"
		]
	},
	"aggregations": {
		"metrics": [
			{
				"group_by": [
					"dimension"
				],
				"group_by_label": [],
				"aggregation": "avg"
			}
		],
		"time": {
			"time_group": "average",
			"time_resampling": 0
		}
	},
	"window": {
		"after": 1763114909,
		"before": 1763115809,
		"points": 5
	}
}

we get this response:

{
	"api": 3,
	"versions": {
		"routing_hard_hash": 1,
		"nodes_hard_hash": 15,
		"contexts_hard_hash": 702582,
		"contexts_soft_hash": 140028,
		"alerts_hard_hash": 30,
		"alerts_soft_hash": 60
	},
	"summary": {},
	"result": {
		"labels": [
			"time",
			"steal",
			"softirq",
			"user",
			"system",
			"iowait"
		],
		"point": {
			"value": 0,
			"arp": 1,
			"pa": 2
		},
		"data": [
			[
				1763115120000,
				[
					0.0098835,
					0,
					0
				],
				[
					0.6042219,
					0,
					0
				],
				[
					9.867367,
					0,
					0
				],
				[
					7.5680344,
					0,
					0
				],
				[
					0.0441542,
					0,
					0
				]
			],
			[
				1763115300000,
				[
					0.0096744,
					0,
					0
				],
				[
					0.6175099,
					0,
					0
				],
				[
					10.0947177,
					0,
					0
				],
				[
					7.6318053,
					0,
					0
				],
				[
					0.0642687,
					0,
					0
				]
			],
			[
				1763115480000,
				[
					0.0099199,
					0,
					0
				],
				[
					0.6479677,
					0,
					0
				],
				[
					10.0691624,
					0,
					0
				],
				[
					7.8327504,
					0,
					0
				],
				[
					0.0685949,
					0,
					0
				]
			],
			[
				1763115660000,
				[
					0.0097324,
					0,
					0
				],
				[
					0.6134363,
					0,
					0
				],
				[
					10.0706015,
					0,
					0
				],
				[
					7.6357065,
					0,
					0
				],
				[
					0.067161,
					0,
					0
				]
			],
			[
				1763115840000,
				[
					0.0097868,
					0,
					0
				],
				[
					0.6209844,
					0.2380952,
					0
				],
				[
					10.1352459,
					0,
					0
				],
				[
					7.7037587,
					0,
					0
				],
				[
					0.0677657,
					0,
					0
				]
			]
		]
	},
	"view": {
		"title": "Total CPU utilization",
		"update_every": 180,
		"after": 1763114941,
		"before": 1763115840,
		"units": "percentage",
		"chart_type": "stacked",
		"dimensions": {
			"grouped_by": [
				"dimension"
			],
			"ids": [
				"steal",
				"softirq",
				"user",
				"system",
				"iowait"
			],
			"names": [
				"steal",
				"softirq",
				"user",
				"system",
				"iowait"
			],
			"units": [
				"percentage",
				"percentage",
				"percentage",
				"percentage",
				"percentage"
			],
			"priorities": [
				2,
				3,
				5,
				6,
				8
			],
			"aggregated": [
				7,
				7,
				7,
				7,
				7
			],
			"sts": {
				"min": [
					0.0096744,
					0.6042219,
					9.867367,
					7.5680344,
					0.0441542
				],
				"max": [
					0.0099199,
					0.6479677,
					10.1352459,
					7.8327504,
					0.0685949
				],
				"avg": [
					0.0097994,
					0.620824,
					10.0474189,
					7.674411,
					0.0623889
				],
				"arp": [
					0,
					0.0457143,
					0,
					0,
					0
				],
				"con": [
					0.0532147,
					3.3713242,
					54.5615257,
					41.6751385,
					0.3387968
				]
			}
		},
		"min": 0,
		"max": 10.1352459
	},
}

you can also see that the view property contains valuable information for the chart visualization, like the title, units, etc.
