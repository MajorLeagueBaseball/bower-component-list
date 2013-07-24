/*jshint camelcase:false */
'use strict';
var request = require('request');
var config = require('./config.json');
var Q = require('q');

var registries = config.registries;
var githubs = config.githubs;
function createComponentData(name, data) {
	return {
		name: name,
		description: data.description,
		owner: data.owner.login,
		website: data.html_url,
		forks: data.forks,
		stars: data.watchers,
		created: data.created_at,
		updated: data.updated_at
	};
}

function fetchComponents() {
	var deferred = Q.defer();

	var promise = Q.all(registries.map(function( registry ) {
		return Q.fcall(function () {
			var deferred = Q.defer();
			request.get(registry, {json: true}, function(err, response, body) {
				if (!err && response.statusCode === 200) {
					deferred.resolve(body);
				} else {
					deferred.reject(new Error(err));
				}
			});
			return deferred.promise;
		}).then(function (list) {
			var results = list.map(function (el) {
				var deferred = Q.defer();
				var github;
				var githubUrl;

				for (var key in githubs) {
					if (el.url.indexOf(key) !== -1) {
						github = githubs[key];
						githubUrl = key;
						//break;
					}
				}

				// only return components from github
				if (!github) {
					deferred.resolve();
					return deferred.promise;
				}

				el.url = el.url.replace( new RegExp(githubUrl.replace(/\./g, '\\.')+':\\w'), githubUrl+'/');
				var re = new RegExp(githubUrl.replace(/\./g, '\\.')+'/([\\w\\-\\.]+)/([\\w\\-\\.]+)', 'i');
				var parsedUrl = re.exec(el.url.replace(/\.git$/, ''));

				// exclude gists or funny urls
				if (!parsedUrl) {
					deferred.resolve();
					return deferred.promise;
				}
				var user = parsedUrl[1];
				var repo = parsedUrl[2];
				var apiUrl = github.api_url + user + '/' + repo;

				request.get(apiUrl, {
					json: true,
					qs: {
						client_id: github.client_id || '',
						client_secret: github.client_secret || ''
					},
					headers: {
						'User-Agent': 'Node.js'
					}
				}, function (err, response, body) {
					if (!err && response.statusCode === 200) {
						deferred.resolve(createComponentData(el.name, body));
					} else {
						if (response.statusCode === 404) {
							// uncomment to get a list of registry items pointing
							// to non-existing repos
							//console.log(el.name + '\n' + el.url + '\n');

							// don't fail just because the repo doesnt exist
							// instead just return `undefined` and filter it out later
							deferred.resolve();
						} else {
							deferred.reject(new Error('GitHub fetch failed\n' + err + '\n' + body));
						}
					}
					return deferred.promise;
				});
				return deferred.promise;
			});

			console.log('Finished fetching data from Bower registry', '' + new Date());

			return Q.all(results);
		});
	}));

	promise.done(function( lists ) {
		var list = [];
		lists.forEach(function(thisList) {
			list = list.concat(thisList);
		});
		deferred.resolve(list);
	}, function() {
		deferred.reject.apply(deferred, arguments);
	});
	return deferred.promise;
}

module.exports = fetchComponents;
