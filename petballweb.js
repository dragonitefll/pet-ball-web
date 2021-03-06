angular.module("petBallWeb", ["ngMaterial"])
  .value("constraints", {video: {facingMode: "user"}, audio: true})
  .value("webRTCConfig", {iceServers: [{url: "stun:stun.l.google.com:19302"}]})
  .controller("PetBallWebController", function($scope, constraints, webRTCConfig, $mdDialog, $timeout) {
    $scope.firebase = firebase;
    $scope.userRef = null;
    $scope.userData = null;

    $scope.screen = "main";

    firebase.auth().onAuthStateChanged(function(user) {
      if (user) {
        user.getToken(true).then(function(token) {
          $scope.token = token;
          $scope.handshake();
        });

        $scope.userRef = firebase.database().ref("/users/").child(user.uid);
        $scope.userRef.on("value", function(data) {
          $timeout(function() {
            $scope.userData = data.val();
          });
        });
      } else {
        $scope.token = undefined;
        $scope.userRef = null;
        $scope.userData = null;
      }
      $scope.currentUser = user;
      $scope.$apply();
    });

    $scope.signIn = function() {
      if ($scope.email && $scope.password) {
        firebase.auth().signInWithEmailAndPassword($scope.email, $scope.password).then(function(result) {
          console.log("Signed in!");
          console.debug(result);
        }, function(error) {
          console.log("Error");
          console.debug(error);
        })
      }
    };

    $scope.signalingChannel = new WebSocket("wss://petball.ward.li:3000");
    $scope.signalingChannel.onopen = $scope.handshake;

    $scope.needsHandshake = true;

    $scope.handshake = function() {
      if ($scope.signalingChannel.readyState == 1 && $scope.token && $scope.needsHandshake) {
        $scope.signalingChannel.send(JSON.stringify({
          hello: "web",
          token: $scope.token
        }));
        $scope.needsHandshake = false;
      }
    };

    $scope.inVideoCall = false;

    $scope.startVideoCall = function() {
      navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
        var video = document.getElementById("remote-stream");

        $scope.peerConnection = new webkitRTCPeerConnection(webRTCConfig);
        $scope.dataChannel = $scope.peerConnection.createDataChannel("");

        $scope.peerConnection.addStream(stream);

        $scope.peerConnection.createOffer().then(function(offer) {
          $scope.peerConnection.setLocalDescription(offer);
        });

        $scope.peerConnection.onnegotiationneeded = function(e) {
          console.log(e);
          $scope.signalingChannel.send(JSON.stringify({
            sdp: $scope.peerConnection.localDescription,
            token: $scope.token
          }));
        }

        $scope.peerConnection.onicecandidate = function(e) {
          if (e.candidate) {
            $scope.signalingChannel.send(JSON.stringify({
              candidate: e.candidate,
              token: $scope.token
            }));
            console.log(e.candidate);
          }
        };

        $scope.signalingChannel.onmessage = function(payload) {
          console.log(payload.data);
          var message = JSON.parse(payload.data);
          if (message.sdp) {
            $scope.peerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp), function() {

            });
          } else {
            var parts = message.candidate.split(":");
            var c = parts[2];
            if (parts.length > 3) {
              c += ":" + parts[3];
            }
            var candidate = new RTCIceCandidate({sdpMid: parts[0], sdpMLineIndex: parseInt(parts[1]), candidate: c});
            $scope.peerConnection.addIceCandidate(candidate);
          }
        };

        $scope.peerConnection.onaddstream = function(e) {
          console.log(e);
          window.event = e;
          video.srcObject = e.stream;

          $scope.inVideoCall = true;
          $scope.$apply();
        };

        document.getElementById("local-stream").srcObject = stream;
        $scope.$apply();
      });
    };

    $scope.endVideoCall = function() {
      $scope.dataChannel.close();
      $scope.peerConnection.close();
      $scope.inVideoCall = false;
      document.getElementById("remote-stream").srcObject = undefined;
      document.getElementById("local-stream").srcObject = undefined;
      window.event = null;

      $scope.signalingChannel.send(JSON.stringify({
        ended: true,
        token: $scope.token
      }));
    };

    $scope.$watch("joystickData.a + ' ' + joystickData.b", function() {
      if ($scope.inVideoCall) {
        ($scope.joystickData.a != 0 && $scope.joystickData.b != 0) && console.log($scope.joystickData);
        $scope.dataChannel.send(JSON.stringify({motors: $scope.joystickData}));
      }
    }, 1000);

    $scope.$watch("laser", function(newValue) {
      if ($scope.inVideoCall) {
        $scope.dataChannel.send(JSON.stringify({laser: newValue}));
      }
    });
    $scope.laser = false;

    $scope.dispenseTreat = function() {
      $scope.dataChannel.send(JSON.stringify({treat: 1}));
    };

    $scope.addCustomActivity = function(e) {
      $mdDialog.show({
        targetEvent: e,
        template: `
          <md-dialog>
            <md-dialog-content class="md-dialog-content">
              <h2 class="md-title">Add a custom activity</h2>
              <p>You'll need to know the name and the URL.</p>
              <form name='customActivityForm'>
                <md-input-container class="md-block">
                  <label>Name</label>
                  <input required ng-model="name" />
                </md-input-container>
                <md-input-container class="md-block">
                  <label>URL</label>
                  <input required type="url" ng-model="url" />
                </md-input-container>
              </form>
            </md-dialog-content>
            <md-dialog-actions>
              <md-button class="md-accent" ng-click="cancel()">Cancel</md-button>
              <md-button class="md-raised md-accent" ng-click="ok()" ng-disabled="!customActivityForm.$valid">Ok</md-button>
            </md-dialog-actions>
          </md-dialog>
        `,
        controller: function($scope, $mdDialog) {
          $scope.ok = function() {
            $mdDialog.hide({name: $scope.name, url: $scope.url});
          };

          $scope.cancel = $mdDialog.cancel;
        }
      }).then(function(result) {
        $scope.userRef.child("activities").push().set(result);
      });
    }

    $scope.launchActivity = function(url) {
      $scope.signalingChannel.send(JSON.stringify({
        url: url,
        token: $scope.token
      }));
      console.log(url);
    };

    $scope.comingSoon = function(e) {
      $mdDialog.show($mdDialog.alert().title('Coming soon').ok('Ok').clickOutsideToClose(true).targetEvent(e)).then(angular.noop);
    }

    $scope.deleteActivity = function(i) {
      $mdDialog.show($mdDialog.confirm().title("Delete this activity?").ok("Delete").cancel("Cancel")).then(function() {
        $scope.userRef.child("activities").child(i).remove();
      });
    }
  })
  .directive("joystick", function() { return {
    templateUrl: "joystick.html",
    restrict: "E",
    transclude: false,
    scope: {value: "=ngModel"},
    controller: function($scope) {
      $scope.size = 200;
      $scope.joystickSize = {width: $scope.size + "px", height: $scope.size + "px"};
      $scope.joystickInnerStyle = {width: $scope.size / 10 + "px", height: $scope.size / 10 + "px"};
      $scope.move = function(x, y) {
        var speed = Math.round(Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2)) * 255 / ($scope.size / 2));
        var direction = Math.round(Math.atan2(y, x) * 180 / Math.PI) + 90;

        switch (Math.floor((direction + (direction < 0 ? 360 : 0)) / 45 + 0.5)) {
          case 1:
            $scope.value = {a: speed * 0.5, b: speed};
            break;
          case 2:
            $scope.value = {a: 0, b: speed};
            break;
          case 3:
            $scope.value = {a: -speed * 0.5, b: -speed};
            break;
          case 4:
            $scope.value = {a: -speed, b: -speed};
            break;
          case 5:
            $scope.value = {a: -speed, b: -speed * 0.5};
            break;
          case 6:
            $scope.value = {a: speed, b: 0};
            break;
          case 7:
            $scope.value = {a: speed, b: speed * 0.5};
            break;
          default:
            $scope.value = {a: speed, b: speed};
            break;
        }

        $scope.joystickInnerStyle.transition = "none";
        $scope.joystickInnerStyle.left = e.offsetX - ($scope.size / 20) + "px";
        $scope.joystickInnerStyle.top = e.offsetY - ($scope.size / 20) + "px";
      };
      $scope.release = function() {
        $scope.value = {a: 0, b: 0};
        $scope.resetJoystickInner();
      };
      $scope.resetJoystickInner = function() {
        $scope.joystickInnerStyle.transition = "all 0.2s";
        $scope.joystickInnerStyle.left = $scope.size * 0.45 + "px";
        $scope.joystickInnerStyle.top = $scope.size * 0.45 + "px";
      };

      $scope.mousemove = function(e) {
        if (e.buttons > 0) {
          var x = e.offsetX - ($scope.size / 2);
          var y = e.offsetY - ($scope.size / 2);
          $scope.move(x, y);
        }
      };

      $scope.release();
    }
  }})
